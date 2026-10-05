const mongoose = require("mongoose");
const Message = require("../messages/model");
const Conversation = require("../conversations/model");
const Player = require("../players/model");
const Team = require("../teams/model");
const ChatRoomState = require("./roomState.model");
const ChatRoomSettings = require("./roomSettings.model");
const ChatReport = require("./report.model");
const PushSubscription = require("./pushSubscription.model");
const { getPublicKey, pushToUsers } = require("./pushService");
const { canAccessTeam } = require("../../common/utils/ownership");
const {
  resolveRoom,
  roomFilter,
  getRoomMembers,
  roomDisplayName,
  labelUsers,
} = require("../../common/utils/chatRooms");
const { ChatError, toClient, emitUpdated } = require("./chatService");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Messages from before chat tracked "read" don't all show up as unread: a
// chat counts as read up to this moment until someone first opens it.
const UNREAD_BASELINE = new Date("2026-10-04T00:00:00Z");
const FOREVER_MS = 100 * 365 * 24 * 60 * 60 * 1000;

function sendError(res, err) {
  if (err instanceof ChatError) return res.status(err.status).json({ message: err.message });
  console.error("Chat error:", err);
  return res.status(500).json({ message: "Something went wrong" });
}

// Accepts { teamId } | { conversationId } | { eventId } in the query or body.
const roomParamsFrom = (req) => {
  const source = { ...req.query, ...req.body };
  return { teamId: source.teamId, conversationId: source.conversationId, eventId: source.eventId };
};

async function requireRoom(req) {
  const room = await resolveRoom(req.user, roomParamsFrom(req));
  if (!room) throw new ChatError(403, "Access denied");
  return room;
}

// The teams whose chat this user belongs to.
async function userTeamIds(user) {
  if (["player", "coach"].includes(user.role) && user.teamId) return [String(user.teamId)];
  if (user.role === "parent" && user.children?.length) {
    const children = await Player.find({ _id: { $in: user.children } }, "teamId").lean();
    return [...new Set(children.map((c) => String(c.teamId)).filter(Boolean))];
  }
  return [];
}

/**
 * GET /api/chat/summary?teamId=optional
 * Every chat the person is in, with unread counts, the last message and mute
 * state. With teamId it is that team's chats; without it, all of theirs (used
 * for the total unread count).
 */
const getSummary = async (req, res) => {
  const { user } = req;
  const { teamId } = req.query;

  try {
    let teamIds;
    if (teamId) {
      if (!isValidId(teamId)) return res.status(400).json({ message: "Invalid teamId" });
      if (!(await canAccessTeam(user, teamId))) return res.status(403).json({ message: "Access denied" });
      teamIds = [String(teamId)];
    } else {
      teamIds = await userTeamIds(user);
    }

    const convFilter = { memberIds: user._id };
    if (teamId) convFilter.teamId = teamId;
    const [teams, conversations] = await Promise.all([
      Team.find({ _id: { $in: teamIds } }).select("name ageGroup").lean(),
      Conversation.find(convFilter).lean(),
    ]);

    const memberUsers = await getRoomMembers({
      type: "group",
      conversation: { memberIds: [...new Set(conversations.flatMap((c) => c.memberIds))] },
    });
    const memberById = new Map(memberUsers.map((m) => [String(m._id), m]));

    const rooms = [
      ...teams.map((team) => ({
        key: `team:${team._id}`,
        type: "team",
        teamId: String(team._id),
        id: null,
        name: "Team chat",
        teamName: `${team.name} ${team.ageGroup || ""}`.trim(),
        filter: { teamId: team._id, conversationId: null, eventId: null },
      })),
      ...conversations.map((conversation) => {
        const members = conversation.memberIds.map((id) => memberById.get(String(id))).filter(Boolean);
        const room = {
          key: `conv:${conversation._id}`,
          type: conversation.kind === "direct" ? "direct" : "group",
          teamId: String(conversation.teamId),
          id: String(conversation._id),
          label: conversation.name,
          filter: { teamId: conversation.teamId, conversationId: conversation._id, eventId: null },
        };
        return {
          ...room,
          name: roomDisplayName(room, user._id, members),
          memberCount: conversation.memberIds.length,
        };
      }),
    ];

    const keys = rooms.map((r) => r.key);
    const [states, settings] = await Promise.all([
      ChatRoomState.find({ userId: user._id, roomKey: { $in: keys } }).lean(),
      ChatRoomSettings.find({ roomKey: { $in: keys } }).lean(),
    ]);
    const stateByKey = new Map(states.map((s) => [s.roomKey, s]));
    const announcementByKey = new Map(settings.map((s) => [s.roomKey, s.announcementOnly]));

    const rows = await Promise.all(
      rooms.map(async (room) => {
        const state = stateByKey.get(room.key);
        const since = state?.lastReadAt || UNREAD_BASELINE;
        const unreadFilter = {
          ...room.filter,
          senderId: { $ne: user._id },
          deletedAt: null,
          createdAt: { $gt: since },
        };
        const [unread, mentioned, last] = await Promise.all([
          Message.countDocuments(unreadFilter),
          Message.countDocuments({ ...unreadFilter, mentions: user._id }),
          Message.findOne({ ...room.filter, deletedAt: null }).sort({ createdAt: -1 }).lean(),
        ]);
        const publicRoom = { ...room };
        delete publicRoom.filter;
        delete publicRoom.label;
        return {
          ...publicRoom,
          announcementOnly: Boolean(announcementByKey.get(room.key)),
          unread,
          mentioned: mentioned > 0,
          mutedUntil: state?.mutedUntil && new Date(state.mutedUntil) > new Date() ? state.mutedUntil : null,
          lastMessage: last
            ? {
                senderName: last.senderName,
                preview: last.text || "[Photo]",
                createdAt: last.createdAt,
              }
            : null,
        };
      })
    );

    // Team chat first, then the rest by most recent activity.
    rows.sort((a, b) => {
      if (a.type === "team" && b.type !== "team") return -1;
      if (b.type === "team" && a.type !== "team") return 1;
      return new Date(b.lastMessage?.createdAt || 0) - new Date(a.lastMessage?.createdAt || 0);
    });

    const totalUnread = rows.filter((r) => !r.mutedUntil).reduce((sum, r) => sum + r.unread, 0);
    return res.json({ totalUnread, rooms: rows });
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/chat/room?teamId|conversationId|eventId
 * What the chat screen needs to know about one room and the person looking at
 * it: its name, whether it is announcements-only, whether they can post or
 * moderate, and whether they have muted it.
 */
const getRoomInfo = async (req, res) => {
  try {
    const room = await requireRoom(req);
    const [members, state] = await Promise.all([
      getRoomMembers(room),
      ChatRoomState.findOne({ userId: req.user._id, roomKey: room.key }).lean(),
    ]);
    const mutedUntil = state?.mutedUntil && new Date(state.mutedUntil) > new Date() ? state.mutedUntil : null;
    return res.json({
      key: room.key,
      type: room.type,
      teamId: String(room.teamId),
      label: roomDisplayName(room, req.user._id, members),
      announcementOnly: room.announcementOnly,
      moderator: room.moderator,
      canPost: room.canPost,
      mutedUntil,
      memberCount: members.length,
      createdBy: room.conversation ? String(room.conversation.createdBy) : null,
    });
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * POST /api/chat/read  { teamId | conversationId | eventId }
 */
const markRead = async (req, res) => {
  try {
    const room = await requireRoom(req);
    await ChatRoomState.updateOne(
      { userId: req.user._id, roomKey: room.key },
      { $set: { lastReadAt: new Date() } },
      { upsert: true }
    );
    return res.json({ ok: true });
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * POST /api/chat/mute  { teamId | conversationId | eventId, minutes? | forever? | unmute? }
 */
const muteRoom = async (req, res) => {
  try {
    const room = await requireRoom(req);
    const { minutes, forever, unmute } = req.body;
    let mutedUntil = null;
    if (!unmute) {
      if (forever) {
        mutedUntil = new Date(Date.now() + FOREVER_MS);
      } else {
        const m = Number(minutes);
        if (!Number.isFinite(m) || m <= 0 || m > 60 * 24 * 365) {
          throw new ChatError(400, "Pick how long to mute this chat.");
        }
        mutedUntil = new Date(Date.now() + m * 60 * 1000);
      }
    }
    await ChatRoomState.updateOne(
      { userId: req.user._id, roomKey: room.key },
      { $set: { mutedUntil } },
      { upsert: true }
    );
    return res.json({ mutedUntil });
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/chat/members?teamId|conversationId|eventId
 * The people in a chat, for the @mention picker.
 */
const listMembers = async (req, res) => {
  try {
    const room = await requireRoom(req);
    const members = (await getRoomMembers(room)).filter((m) => String(m._id) !== String(req.user._id));
    const labels = await labelUsers(members);
    return res.json(
      members
        .map((m) => ({ _id: m._id, name: m.name, role: m.role, label: labels.get(String(m._id)) }))
        .sort((a, b) => a.label.localeCompare(b.label))
    );
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/chat/seen?teamId|conversationId|eventId&messageId=
 * Who has opened the chat since a message was sent. Visible to the sender and
 * to coaches/admins, so families can't see each other's reading habits.
 */
const getSeenBy = async (req, res) => {
  try {
    const room = await requireRoom(req);
    const { messageId } = req.query;
    if (!isValidId(messageId)) throw new ChatError(400, "Invalid message id");
    const message = await Message.findOne({ _id: messageId, ...roomFilter(room) }).lean();
    if (!message) throw new ChatError(404, "Message not found");
    const isSender = String(message.senderId) === String(req.user._id);
    if (!isSender && !room.moderator) throw new ChatError(403, "Only the sender or a coach can see this.");

    const members = (await getRoomMembers(room)).filter(
      (m) => String(m._id) !== String(message.senderId)
    );
    const states = await ChatRoomState.find({
      roomKey: room.key,
      userId: { $in: members.map((m) => m._id) },
    }).lean();
    const lastRead = new Map(states.map((s) => [String(s.userId), s.lastReadAt]));
    const labels = await labelUsers(members);

    const seen = [];
    const notSeen = [];
    members.forEach((m) => {
      const read = lastRead.get(String(m._id));
      const row = { _id: m._id, name: m.name, role: m.role, label: labels.get(String(m._id)) };
      if (read && new Date(read) >= new Date(message.createdAt)) seen.push(row);
      else notSeen.push(row);
    });
    const byLabel = (a, b) => a.label.localeCompare(b.label);
    return res.json({ total: members.length, seen: seen.sort(byLabel), notSeen: notSeen.sort(byLabel) });
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * GET /api/chat/pinned?teamId|conversationId|eventId
 */
const listPinned = async (req, res) => {
  try {
    const room = await requireRoom(req);
    const pinned = await Message.find({ ...roomFilter(room), pinnedAt: { $ne: null }, deletedAt: null })
      .sort({ pinnedAt: -1 })
      .lean();
    return res.json(pinned.map(toClient));
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * PATCH /api/chat/settings  { teamId | conversationId | eventId, announcementOnly }
 * Coaches and admins can make a chat read-only for everyone else.
 */
const updateSettings = async (req, res) => {
  try {
    const room = await requireRoom(req);
    if (!room.moderator) throw new ChatError(403, "Only a coach or admin can change this.");
    if (typeof req.body.announcementOnly !== "boolean") {
      throw new ChatError(400, "announcementOnly must be true or false");
    }
    await ChatRoomSettings.updateOne(
      { roomKey: room.key },
      { $set: { announcementOnly: req.body.announcementOnly, updatedBy: req.user._id } },
      { upsert: true }
    );
    const io = req.app.get("io");
    if (io) io.to(room.socketRoom).emit("room-updated", { roomKey: room.key, announcementOnly: req.body.announcementOnly });
    return res.json({ announcementOnly: req.body.announcementOnly });
  } catch (err) {
    return sendError(res, err);
  }
};

// ---------- reports (admin) ----------

/**
 * GET /api/chat/reports?status=open
 * Each report comes with the few messages before it, so an admin can judge it
 * in context without being able to browse private chats.
 */
const listReports = async (req, res) => {
  const status = ["open", "dismissed", "actioned"].includes(req.query.status) ? req.query.status : "open";
  try {
    const reports = await ChatReport.find({ status }).sort({ createdAt: -1 }).limit(100).lean();
    const rows = await Promise.all(
      reports.map(async (report) => {
        const message = await Message.findById(report.messageId).lean();
        let context = [];
        if (message) {
          const before = await Message.find({
            ...roomFilter({
              teamId: message.teamId,
              conversationId: message.conversationId,
              eventId: message.eventId,
            }),
            createdAt: { $lt: message.createdAt },
            deletedAt: null,
          })
            .sort({ createdAt: -1 })
            .limit(3)
            .lean();
          context = before.reverse().map((m) => ({
            senderName: m.senderName,
            text: m.text || (m.imageId ? "[Photo]" : ""),
            createdAt: m.createdAt,
          }));
        }
        return { ...report, messageDeleted: !message || Boolean(message.deletedAt), context };
      })
    );
    return res.json(rows);
  } catch (err) {
    return sendError(res, err);
  }
};

/**
 * POST /api/chat/reports/:id/resolve  { action: "dismiss" | "delete-message" }
 */
const resolveReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    if (!isValidId(id)) throw new ChatError(400, "Invalid report id");
    if (!["dismiss", "delete-message"].includes(action)) throw new ChatError(400, "Invalid action");
    const report = await ChatReport.findById(id);
    if (!report) throw new ChatError(404, "Report not found");

    if (action === "delete-message") {
      const message = await Message.findById(report.messageId);
      if (message && !message.deletedAt) {
        message.deletedAt = new Date();
        message.deletedBy = req.user._id;
        message.text = "";
        message.imageId = null;
        message.pinnedAt = null;
        await message.save();
        // An admin isn't a member of a private chat, so announce to its live
        // connections directly instead of resolving the room as the admin.
        let socketRoom = String(message.teamId);
        if (message.conversationId) socketRoom = `conversation:${message.conversationId}`;
        else if (message.eventId) socketRoom = `event:${message.eventId}`;
        emitUpdated(req.app.get("io"), { socketRoom }, message);
      }
    }
    report.status = action === "dismiss" ? "dismissed" : "actioned";
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    await report.save();
    return res.json({ _id: report._id, status: report.status });
  } catch (err) {
    return sendError(res, err);
  }
};

// ---------- push subscriptions ----------

const getPushKey = async (req, res) => {
  try {
    return res.json({ publicKey: await getPublicKey() });
  } catch (err) {
    console.error("Push key error:", err);
    return res.status(500).json({ message: "Notifications aren't available right now." });
  }
};

/**
 * POST /api/chat/push/subscribe  { subscription: { endpoint, keys: { p256dh, auth } } }
 */
const subscribePush = async (req, res) => {
  const { subscription } = req.body;
  if (
    !subscription ||
    typeof subscription.endpoint !== "string" ||
    !subscription.endpoint.startsWith("https://") ||
    !subscription.keys?.p256dh ||
    !subscription.keys?.auth
  ) {
    return res.status(400).json({ message: "That isn't a valid notification subscription." });
  }
  try {
    await PushSubscription.updateOne(
      { endpoint: subscription.endpoint },
      {
        $set: {
          userId: req.user._id,
          keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth },
          userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
          failureCount: 0,
        },
      },
      { upsert: true }
    );
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error("Push subscribe error:", err);
    return res.status(500).json({ message: "Couldn't turn on notifications." });
  }
};

const unsubscribePush = async (req, res) => {
  const { endpoint } = req.body;
  if (typeof endpoint !== "string") return res.status(400).json({ message: "endpoint is required" });
  await PushSubscription.deleteOne({ endpoint, userId: req.user._id });
  return res.json({ ok: true });
};

const pushStatus = async (req, res) => {
  const devices = await PushSubscription.countDocuments({ userId: req.user._id });
  return res.json({ devices });
};

const sendTestPush = async (req, res) => {
  const result = await pushToUsers([req.user._id], {
    title: "Notifications are on",
    body: "You'll get chat and schedule alerts here.",
    url: "/",
    tag: "push-test",
  });
  return res.json(result);
};

module.exports = {
  getRoomInfo,
  getSummary,
  markRead,
  muteRoom,
  listMembers,
  getSeenBy,
  listPinned,
  updateSettings,
  listReports,
  resolveReport,
  getPushKey,
  subscribePush,
  unsubscribePush,
  pushStatus,
  sendTestPush,
};
