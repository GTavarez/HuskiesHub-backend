const mongoose = require("mongoose");
const Message = require("./model");
const ChatDigestState = require("./chatDigestState.model");
const ChatRoomState = require("../chat/roomState.model");
const ChatReport = require("../chat/report.model");
const User = require("../users/model");
const Team = require("../teams/model");
const { resolveRoom, roomFilter } = require("../../common/utils/chatRooms");
const { getTransporter } = require("../../common/utils/mailer");
const { findTeamContacts } = require("../../common/utils/teamContacts");
const { getBucket } = require("../../common/utils/gridfs");
const {
  ChatError,
  EDIT_WINDOW_MS,
  MAX_TEXT_LENGTH,
  REACTION_EMOJIS,
  toClient,
  emitUpdated,
  listMessages,
} = require("../chat/chatService");
const { pushToUsers } = require("../chat/pushService");

const DIGEST_LOOKBACK_DAYS = 7; // only scan teams with recent chat activity
const DEFAULT_LOOKBACK_HOURS = 24; // window for a user's first-ever digest
const MAX_PINNED = 5;

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

function sendChatError(res, err) {
  if (err instanceof ChatError) return res.status(err.status).json({ message: err.message });
  console.error("Chat error:", err);
  return res.status(500).json({ message: "Something went wrong" });
}

// The room a stored message belongs to, as `user` is allowed to see it (or null).
function roomForMessage(user, message) {
  if (message.conversationId) return resolveRoom(user, { conversationId: message.conversationId });
  if (message.eventId) return resolveRoom(user, { eventId: message.eventId });
  return resolveRoom(user, { teamId: message.teamId });
}

// Loads a message and the room it is in, checking the caller can be in it.
async function loadMessageAndRoom(req) {
  const { id } = req.params;
  if (!isValidId(id)) throw new ChatError(400, "Invalid message id");
  const message = await Message.findById(id);
  if (!message) throw new ChatError(404, "Message not found");
  const room = await roomForMessage(req.user, message);
  if (!room) throw new ChatError(403, "Access denied");
  return { message, room };
}

/**
 * GET /api/messages/:teamId?before=<messageId>&limit=
 */
const getTeamMessages = async (req, res) => {
  try {
    const { teamId } = req.params;
    if (!isValidId(teamId)) {
      return res.status(400).json({ message: "Invalid teamId" });
    }
    const room = await resolveRoom(req.user, { teamId });
    if (!room) return res.status(403).send({ message: "Access denied" });
    return res.json(await listMessages(room, req.query));
  } catch (err) {
    console.error("❌ Error fetching messages:", err);
    return res.status(500).json({ message: "Failed to load messages" });
  }
};

/**
 * GET /api/messages/event/:eventId?before=&limit=
 * The chat for one game or practice.
 */
const getEventMessages = async (req, res) => {
  try {
    const { eventId } = req.params;
    if (!isValidId(eventId)) {
      return res.status(400).json({ message: "Invalid event id" });
    }
    const room = await resolveRoom(req.user, { eventId });
    if (!room) return res.status(403).send({ message: "Access denied" });
    return res.json(await listMessages(room, req.query));
  } catch (err) {
    console.error("❌ Error fetching event messages:", err);
    return res.status(500).json({ message: "Failed to load messages" });
  }
};

/**
 * PATCH /api/messages/:id  { text }   (your own message, within 24 hours)
 */
const editMessage = async (req, res) => {
  try {
    const { message, room } = await loadMessageAndRoom(req);
    if (message.deletedAt) throw new ChatError(400, "That message was deleted.");
    if (String(message.senderId) !== String(req.user._id)) {
      throw new ChatError(403, "You can only edit your own messages.");
    }
    if (Date.now() - new Date(message.createdAt).getTime() > EDIT_WINDOW_MS) {
      throw new ChatError(400, "Messages can only be edited for 24 hours after they're sent.");
    }
    const text = typeof req.body.text === "string" ? req.body.text.trim() : "";
    if (!text && !message.imageId) throw new ChatError(400, "A message can't be empty.");
    if (text.length > MAX_TEXT_LENGTH) {
      throw new ChatError(400, `Messages can be up to ${MAX_TEXT_LENGTH} characters.`);
    }
    if (text === message.text) return res.json(toClient(message));

    message.text = text;
    message.editedAt = new Date();
    await message.save();
    emitUpdated(req.app.get("io"), room, message);
    return res.json(toClient(message));
  } catch (err) {
    return sendChatError(res, err);
  }
};

/**
 * DELETE /api/messages/:id
 * Your own message, or any message if you moderate the room. The row is kept
 * (so replies and reports still make sense) but its content is cleared.
 */
const deleteMessage = async (req, res) => {
  try {
    const { message, room } = await loadMessageAndRoom(req);
    if (message.deletedAt) return res.json(toClient(message));
    const isOwn = String(message.senderId) === String(req.user._id);
    if (!isOwn && !room.moderator) {
      throw new ChatError(403, "Only the sender, a coach or an admin can delete this.");
    }

    const photoId = message.imageId;
    message.deletedAt = new Date();
    message.deletedBy = req.user._id;
    message.text = "";
    message.imageId = null;
    message.pinnedAt = null;
    message.pinnedBy = null;
    await message.save();
    if (photoId) getBucket().delete(photoId).catch(() => {});

    emitUpdated(req.app.get("io"), room, message);
    return res.json(toClient(message));
  } catch (err) {
    return sendChatError(res, err);
  }
};

const setPinned = (pinned) => async (req, res) => {
  try {
    const { message, room } = await loadMessageAndRoom(req);
    if (!room.moderator) throw new ChatError(403, "Only a coach or admin can pin messages.");
    if (message.deletedAt) throw new ChatError(400, "That message was deleted.");

    if (pinned) {
      if (!message.pinnedAt) {
        const count = await Message.countDocuments({
          ...roomFilter(room),
          pinnedAt: { $ne: null },
          deletedAt: null,
        });
        if (count >= MAX_PINNED) {
          throw new ChatError(409, `Up to ${MAX_PINNED} messages can be pinned. Unpin one first.`);
        }
        message.pinnedAt = new Date();
        message.pinnedBy = req.user._id;
      }
    } else {
      message.pinnedAt = null;
      message.pinnedBy = null;
    }
    await message.save();
    emitUpdated(req.app.get("io"), room, message);
    return res.json(toClient(message));
  } catch (err) {
    return sendChatError(res, err);
  }
};

/**
 * POST /api/messages/:id/react  { emoji }   (tap again to remove)
 */
const reactToMessage = async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!REACTION_EMOJIS.includes(emoji)) throw new ChatError(400, "That reaction isn't available.");
    const { message, room } = await loadMessageAndRoom(req);
    if (message.deletedAt) throw new ChatError(400, "That message was deleted.");

    const userId = String(req.user._id);
    const entry = message.reactions.find((r) => r.emoji === emoji);
    if (!entry) {
      message.reactions.push({ emoji, userIds: [req.user._id] });
    } else if (entry.userIds.some((id) => String(id) === userId)) {
      entry.userIds = entry.userIds.filter((id) => String(id) !== userId);
    } else {
      entry.userIds.push(req.user._id);
    }
    message.reactions = message.reactions.filter((r) => r.userIds.length > 0);
    await message.save();
    emitUpdated(req.app.get("io"), room, message);
    return res.json(toClient(message));
  } catch (err) {
    return sendChatError(res, err);
  }
};

/**
 * POST /api/messages/:id/report  { reason }
 * Flags a message for admins. Anyone in the room can report someone else's.
 */
const reportMessage = async (req, res) => {
  try {
    const { message, room } = await loadMessageAndRoom(req);
    if (message.deletedAt) throw new ChatError(400, "That message was deleted.");
    if (String(message.senderId) === String(req.user._id)) {
      throw new ChatError(400, "You can't report your own message.");
    }
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";

    try {
      await ChatReport.create({
        messageId: message._id,
        teamId: message.teamId,
        roomKey: room.key,
        reporterId: req.user._id,
        reporterName: req.user.name,
        senderId: message.senderId,
        senderName: message.senderName,
        textSnapshot: message.text || (message.imageId ? "[Photo]" : ""),
        reason,
      });
    } catch (err) {
      if (err.code === 11000) throw new ChatError(409, "You already reported this message.");
      throw err;
    }

    // Let admins know. Test accounts never trigger real notifications.
    if (!req.user.isTestAccount) {
      const admins = await User.find({ role: "admin", isTestAccount: { $ne: true } }).select("_id").lean();
      pushToUsers(
        admins.map((a) => a._id),
        {
          title: "A chat message was reported",
          body: `${req.user.name} reported a message from ${message.senderName}.`,
          url: "/admin",
          tag: "chat-report",
        }
      ).catch(() => {});
    }
    return res.status(201).json({ message: "Thanks. An admin will take a look." });
  } catch (err) {
    return sendChatError(res, err);
  }
};

// Emails one contact a summary of team-chat messages they haven't seen since
// their last digest, then advances their digest state to `now`. Returns true
// if an email was sent. Messages the person has already read in the app, and
// chats they muted, are left out so the email only covers what they missed.
async function sendDigestToContact(user, team, now) {
  const roomKey = `team:${team._id}`;
  const [state, roomState] = await Promise.all([
    ChatDigestState.findOne({ userId: user._id, teamId: team._id }),
    ChatRoomState.findOne({ userId: user._id, roomKey }).lean(),
  ]);

  const markDone = () =>
    ChatDigestState.updateOne(
      { userId: user._id, teamId: team._id },
      { $set: { lastNotifiedAt: now } },
      { upsert: true }
    );

  if (roomState?.mutedUntil && new Date(roomState.mutedUntil) > now) {
    await markDone();
    return false;
  }

  const lastDigest = state?.lastNotifiedAt || new Date(now - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000);
  const since = roomState?.lastReadAt && roomState.lastReadAt > lastDigest ? roomState.lastReadAt : lastDigest;

  // conversationId/eventId: null — group, direct and event messages are scoped
  // to their own members and must never leak into the whole-team digest email.
  const unread = await Message.find({
    teamId: team._id,
    conversationId: null,
    eventId: null,
    senderId: { $ne: user._id },
    deletedAt: null,
    createdAt: { $gt: since },
  }).sort({ createdAt: 1 });

  if (unread.length === 0) {
    await markDone();
    return false;
  }

  const preview = unread
    .slice(-5)
    .map((m) => `${m.senderName}: ${[m.text, m.imageId ? "[photo]" : ""].filter(Boolean).join(" ")}`)
    .join("\n");

  try {
    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
    await transporter.sendMail({
      from: fromEmail,
      to: user.email,
      subject: `${unread.length} new message${unread.length === 1 ? "" : "s"} in ${team.name} team chat`,
      text: [
        `Hi ${user.name},`,
        "",
        `You have ${unread.length} new message${unread.length === 1 ? "" : "s"} in the ${team.name} team chat:`,
        "",
        preview,
        "",
        "Log in to HuskiesHub to read and reply.",
      ].join("\n"),
    });
  } catch (err) {
    console.warn("Chat digest email not sent:", err.message);
    return false;
  }

  await markDone();
  return true;
}

/**
 * POST /api/messages/run-chat-digest-cron
 * Shared-secret-authenticated (Cloud Scheduler), same pattern as the
 * autopay/reminder crons. Intended to run on a schedule (e.g. a few times a
 * day) rather than per-message, so an active chat produces one summary email
 * instead of one email per message. Push notifications are the real-time
 * channel; this is the safety net for people who haven't turned them on.
 */
const runChatDigestCron = async (req, res) => {
  if (req.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const now = new Date();
    const lookbackStart = new Date(now - DIGEST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const activeTeamIds = await Message.distinct("teamId", {
      createdAt: { $gt: lookbackStart },
      conversationId: null,
      eventId: null,
    });
    const teams = await Team.find({ _id: { $in: activeTeamIds } });

    const resultsByTeam = await Promise.all(
      teams.map(async (team) => {
        const contacts = await findTeamContacts(team._id);
        const results = await Promise.all(
          contacts.map((user) => sendDigestToContact(user, team, now))
        );
        return results.filter(Boolean).length;
      })
    );
    const digestsSent = resultsByTeam.reduce((sum, n) => sum + n, 0);

    return res.json({ teamsChecked: teams.length, digestsSent });
  } catch (err) {
    console.error("Run chat digest cron error:", err);
    return res.status(500).json({ message: "Failed to run chat digest" });
  }
};

module.exports = {
  getTeamMessages,
  getEventMessages,
  editMessage,
  deleteMessage,
  pinMessage: setPinned(true),
  unpinMessage: setPinned(false),
  reactToMessage,
  reportMessage,
  runChatDigestCron,
};
