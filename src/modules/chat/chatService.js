const mongoose = require("mongoose");
const Message = require("../messages/model");
const Team = require("../teams/model");
const ChatRoomState = require("./roomState.model");
const { pushToUsers } = require("./pushService");
const { getRoomMembers, roomFilter } = require("../../common/utils/chatRooms");
const { getTransporter } = require("../../common/utils/mailer");

const MAX_TEXT_LENGTH = 2000;
const MAX_MENTIONS = 20;
const MAX_URGENT_PER_HOUR = 3;
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "🙏", "🥎"];

// An error with an HTTP-style status, so REST handlers and the socket handler
// can both report it the same way.
class ChatError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const excerpt = (text, max = 120) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

// What a client should see. A deleted message keeps its place in the list but
// carries no content.
function toClient(doc) {
  const message = doc.toObject ? doc.toObject() : { ...doc };
  if (message.deletedAt) {
    message.text = "";
    message.imageId = null;
    message.reactions = [];
    message.replyTo = undefined;
    message.mentions = [];
    message.pinnedAt = null;
  }
  return message;
}

function emitUpdated(io, room, message) {
  if (io) io.to(room.socketRoom).emit("message-updated", toClient(message));
}

// Which people are looking at this room right now (a visible tab with the room
// open). They see the message live, so they don't also get a push.
async function presentUserIds(io, socketRoom) {
  if (!io) return new Set();
  const sockets = await io.in(socketRoom).fetchSockets();
  return new Set(
    sockets.filter((s) => s.data.visible !== false && s.data.user).map((s) => String(s.data.user._id))
  );
}

const roomUrl = (room) => `/teams/${room.teamId}?chat=${room.key}`;

async function roomTitle(room, sender) {
  if (room.type === "direct") return `Message from ${sender.name}`;
  if (room.type === "group") return room.label;
  const team = await Team.findById(room.teamId).select("name ageGroup").lean();
  const teamName = team ? `${team.name} ${team.ageGroup || ""}`.trim() : "Team";
  return room.type === "event" ? `${teamName}: ${room.label}` : `${teamName} chat`;
}

async function sendUrgentEmails(recipients, sender, title, preview, room) {
  const baseUrl = process.env.FRONTEND_URL || "https://eshuskiesyoffee.com";
  let transporter;
  try {
    transporter = getTransporter();
  } catch (err) {
    console.warn("Urgent chat email skipped:", err.message);
    return;
  }
  const from = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
  await Promise.all(
    recipients
      .filter((user) => user.email)
      .map((user) =>
        transporter
          .sendMail({
            from,
            to: user.email,
            subject: `Urgent from ${sender.name}: ${excerpt(preview, 60)}`,
            text: [
              `Hi ${user.name},`,
              "",
              `${sender.name} sent an urgent message in ${title}:`,
              "",
              preview,
              "",
              `Open it in HuskiesHub: ${baseUrl}${roomUrl(room)}`,
            ].join("\n"),
          })
          .catch((err) => console.warn("Urgent chat email not sent:", err.message))
      )
  );
}

// Push to everyone who should hear about a new message (not the sender, not
// people already looking at the chat, not people who muted it unless they were
// @mentioned or the message is urgent), and email everyone for an urgent one.
// Test accounts never get real notifications.
async function notifyRoomMembers({ io, room, message, sender }) {
  const members = await getRoomMembers(room);
  const recipients = members.filter(
    (m) => String(m._id) !== String(sender._id) && !m.isTestAccount
  );
  if (recipients.length === 0) return;

  const [present, states] = await Promise.all([
    presentUserIds(io, room.socketRoom),
    ChatRoomState.find({ userId: { $in: recipients.map((m) => m._id) }, roomKey: room.key }).lean(),
  ]);
  const mutedUntil = new Map(states.map((s) => [String(s.userId), s.mutedUntil]));
  const mentioned = new Set((message.mentions || []).map(String));
  const now = Date.now();

  const pushTargets = recipients.filter((m) => {
    const id = String(m._id);
    if (present.has(id)) return false;
    const muted = mutedUntil.get(id) && new Date(mutedUntil.get(id)).getTime() > now;
    return !muted || mentioned.has(id) || message.urgent;
  });

  const title = await roomTitle(room, sender);
  const preview = message.text || "[Photo]";
  await pushToUsers(
    pushTargets.map((m) => m._id),
    {
      title: message.urgent ? `Urgent: ${title}` : title,
      body: `${sender.name}: ${excerpt(preview, 140)}`,
      url: roomUrl(room),
      tag: room.key,
      urgent: Boolean(message.urgent),
    }
  );

  if (message.urgent) {
    await sendUrgentEmails(recipients, sender, title, preview, room);
  }
}

// The single place a message is created, so the socket handler and the photo
// upload enforce the same rules.
async function createMessage({ io, room, user, text, replyToId, mentionIds, urgent, imageId }) {
  const cleanText = typeof text === "string" ? text.trim() : "";
  if (!cleanText && !imageId) throw new ChatError(400, "Write a message first.");
  if (cleanText.length > MAX_TEXT_LENGTH) {
    throw new ChatError(400, `Messages can be up to ${MAX_TEXT_LENGTH} characters.`);
  }
  if (!room.canPost) {
    throw new ChatError(403, "Only coaches and admins can post here.");
  }

  let replyTo;
  if (replyToId) {
    if (!mongoose.Types.ObjectId.isValid(replyToId)) throw new ChatError(400, "Invalid reply.");
    const original = await Message.findOne({ _id: replyToId, ...roomFilter(room) });
    if (!original || original.deletedAt) throw new ChatError(400, "That message is no longer there.");
    replyTo = {
      messageId: original._id,
      senderName: original.senderName,
      text: excerpt(original.text || ""),
      hasImage: Boolean(original.imageId),
    };
  }

  let mentions = [];
  if (Array.isArray(mentionIds) && mentionIds.length > 0) {
    const members = await getRoomMembers(room);
    const memberIds = new Set(members.map((m) => String(m._id)));
    mentions = [...new Set(mentionIds.map(String))]
      .filter((id) => memberIds.has(id) && id !== String(user._id))
      .slice(0, MAX_MENTIONS);
  }

  let isUrgent = false;
  if (urgent) {
    if (!room.moderator) throw new ChatError(403, "Only coaches and admins can send urgent messages.");
    const recent = await Message.countDocuments({
      senderId: user._id,
      urgent: true,
      createdAt: { $gt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    if (recent >= MAX_URGENT_PER_HOUR) {
      throw new ChatError(429, "You've sent several urgent messages this hour. Try again later.");
    }
    isUrgent = true;
  }

  const message = await Message.create({
    teamId: room.teamId,
    conversationId: room.conversationId || null,
    eventId: room.eventId || null,
    senderId: user._id,
    senderName: user.name,
    senderRole: user.role,
    senderAvatar: user.avatar || "",
    text: cleanText,
    imageId: imageId || null,
    replyTo,
    mentions,
    urgent: isUrgent,
  });

  const payload = toClient(message);
  if (io) io.to(room.socketRoom).emit("new-message", payload);

  notifyRoomMembers({ io, room, message, sender: user }).catch((err) =>
    console.warn("Chat notification failed:", err.message)
  );
  return payload;
}

// Oldest to newest, one page at a time. `before` is the id of the oldest
// message the client already has.
async function listMessages(room, { before, limit = 50 } = {}) {
  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const filter = roomFilter(room);

  if (before && mongoose.Types.ObjectId.isValid(before)) {
    const anchor = await Message.findById(before).select("createdAt").lean();
    if (anchor) {
      filter.$or = [
        { createdAt: { $lt: anchor.createdAt } },
        { createdAt: anchor.createdAt, _id: { $lt: anchor._id } },
      ];
    }
  }

  const messages = await Message.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(pageSize)
    .lean();
  return messages.reverse().map(toClient);
}

module.exports = {
  ChatError,
  MAX_TEXT_LENGTH,
  EDIT_WINDOW_MS,
  REACTION_EMOJIS,
  toClient,
  emitUpdated,
  createMessage,
  listMessages,
  presentUserIds,
};
