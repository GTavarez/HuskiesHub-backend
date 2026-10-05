const mongoose = require("mongoose");
const Message = require("./model");
const { resolveRoom } = require("../../common/utils/chatRooms");
const { getBucket } = require("../../common/utils/gridfs");
const { ChatError, createMessage } = require("../chat/chatService");

// SVG is deliberately not here: an SVG can carry script, and these bytes get
// opened in the browser.
const SAFE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"];

// The room a photo is being posted to: a group/direct chat, a game's chat, or
// the whole-team chat, whichever the request names.
const roomParams = (body) => ({
  teamId: body.teamId,
  conversationId: body.conversationId,
  eventId: body.eventId,
});

/**
 * POST /api/messages/photo  (multipart: photo, teamId | conversationId | eventId, text?, replyToId?)
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
    const room = await resolveRoom(req.user, roomParams(req.body));
    if (!room) {
      return res.status(403).json({ message: "Access denied" });
    }
    // Checked before the file is stored, so a refused post leaves no orphan upload.
    if (!room.canPost) {
      return res.status(403).json({ message: "Only coaches and admins can post here." });
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

    try {
      const message = await createMessage({
        io: req.app.get("io"),
        room,
        user: req.user,
        text,
        replyToId: req.body.replyToId,
        imageId: fileId,
      });
      return res.status(201).json(message);
    } catch (err) {
      bucket.delete(fileId).catch(() => {});
      throw err;
    }
  } catch (err) {
    if (err instanceof ChatError) return res.status(err.status).json({ message: err.message });
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
    if (!message || !message.imageId || message.deletedAt) {
      return res.status(404).json({ message: "Photo not found" });
    }

    let params = { teamId: message.teamId };
    if (message.conversationId) params = { conversationId: message.conversationId };
    else if (message.eventId) params = { eventId: message.eventId };
    const room = await resolveRoom(req.user, params);
    if (!room) {
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
