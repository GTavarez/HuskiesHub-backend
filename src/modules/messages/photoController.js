const mongoose = require("mongoose");
const Message = require("./model");
const Conversation = require("../conversations/model");
const { canAccessTeam, canAccessConversation } = require("../../common/utils/ownership");
const { getBucket } = require("../../common/utils/gridfs");

// SVG is deliberately not here: an SVG can carry script, and these bytes get
// opened in the browser.
const SAFE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

// Resolves which chat room a request is about and whether the user may be in
// it. Returns { room, teamId, conversationId } or null when access is denied.
async function resolveRoom(user, { teamId, conversationId }) {
  if (conversationId) {
    if (!mongoose.Types.ObjectId.isValid(conversationId)) return null;
    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation || !canAccessConversation(user, conversation)) return null;
    return {
      room: `conversation:${conversationId}`,
      teamId: conversation.teamId,
      conversationId,
    };
  }
  if (!teamId || !mongoose.Types.ObjectId.isValid(teamId)) return null;
  if (!(await canAccessTeam(user, teamId))) return null;
  return { room: String(teamId), teamId, conversationId: null };
}

/**
 * POST /api/messages/photo  (multipart: photo, teamId | conversationId, text?)
 * Stores the photo and posts it into the chat for everyone in the room.
 */
const sendPhotoMessage = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No photo uploaded" });
  }
  const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
  if (text.length > 1000) {
    return res.status(400).json({ message: "Caption is too long (1000 characters max)" });
  }

  try {
    const target = await resolveRoom(req.user, req.body);
    if (!target) {
      return res.status(403).json({ message: "Access denied" });
    }

    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(`chat-${Date.now()}`, {
      contentType: req.file.mimetype,
      metadata: {
        owner: req.user._id.toString(),
        originalName: req.file.originalname,
        kind: "chat",
      },
    });
    uploadStream.end(req.file.buffer);
    const fileId = await new Promise((resolve, reject) => {
      uploadStream.on("finish", () => resolve(uploadStream.id));
      uploadStream.on("error", reject);
    });

    const message = await Message.create({
      teamId: target.teamId,
      conversationId: target.conversationId,
      senderId: req.user._id,
      senderName: req.user.name,
      text,
      imageId: fileId,
    });

    const io = req.app.get("io");
    if (io) io.to(target.room).emit("new-message", message);

    return res.status(201).json(message);
  } catch (err) {
    console.error("Send chat photo error:", err);
    return res.status(500).json({ message: "Failed to send photo" });
  }
};

/**
 * GET /api/messages/photo/:messageId
 * Streams a chat photo, but only to someone who is allowed in that chat.
 */
const getMessagePhoto = async (req, res) => {
  const { messageId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(messageId)) {
    return res.status(400).json({ message: "Invalid message id" });
  }

  try {
    const message = await Message.findById(messageId).lean();
    if (!message || !message.imageId) {
      return res.status(404).json({ message: "Photo not found" });
    }

    const target = await resolveRoom(req.user, {
      teamId: message.conversationId ? null : message.teamId,
      conversationId: message.conversationId,
    });
    if (!target) {
      return res.status(403).json({ message: "Access denied" });
    }

    const bucket = getBucket();
    const [file] = await bucket.find({ _id: message.imageId }).toArray();
    if (!file) {
      return res.status(404).json({ message: "Photo not found" });
    }

    res.set("Content-Type", SAFE_IMAGE_TYPES.includes(file.contentType) ? file.contentType : "application/octet-stream");
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Cache-Control", "private, max-age=86400");

    const stream = bucket.openDownloadStream(message.imageId);
    stream.on("error", () => {
      if (!res.headersSent) res.status(500).json({ message: "Failed to load photo" });
    });
    return stream.pipe(res);
  } catch (err) {
    console.error("Get chat photo error:", err);
    return res.status(500).json({ message: "Failed to load photo" });
  }
};

module.exports = { sendPhotoMessage, getMessagePhoto, SAFE_IMAGE_TYPES };
