const mongoose = require("mongoose");
const Conversation = require("../../modules/conversations/model");
const Event = require("../../modules/events/model");
const Player = require("../../modules/players/model");
const Registration = require("../../modules/registrations/model");
const User = require("../../modules/users/model");
const ChatRoomSettings = require("../../modules/chat/roomSettings.model");
const { canAccessTeam, canAccessConversation } = require("./ownership");

// A "room" is one place messages live: the whole-team chat, a group chat or
// direct message, or one game/practice's own chat. Everything that touches a
// room (sockets, REST, notifications) goes through resolveRoom, so the access
// rules are written once.

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Moderators can delete anyone's message, pin, and use "announcements only".
// Admins moderate every team and event room. A coach moderates their own
// team's rooms. In a group chat or DM only a coach/admin who is a member
// counts, because membership is the only way into those rooms.
function isModerator(user, room) {
  if (!user) return false;
  if (room.type === "team" || room.type === "event") {
    return (
      user.role === "admin" ||
      (user.role === "coach" && user.teamId && String(user.teamId) === String(room.teamId))
    );
  }
  return ["coach", "admin"].includes(user.role);
}

function buildRoom(user, base) {
  const room = { ...base };
  room.moderator = isModerator(user, room);
  room.canPost = !room.announcementOnly || room.moderator;
  return room;
}

// Returns the room if `user` may be in it, otherwise null. `params` is any one
// of { teamId } | { conversationId } | { eventId }.
async function resolveRoom(user, params = {}) {
  const { teamId, conversationId, eventId } = params;

  if (conversationId) {
    if (!isValidId(conversationId)) return null;
    const conversation = await Conversation.findById(conversationId).lean();
    if (!conversation || !canAccessConversation(user, conversation)) return null;
    // A family taken off the team also loses that team's group chats and DMs.
    if (["player", "parent"].includes(user.role) && !(await canAccessTeam(user, conversation.teamId))) {
      return null;
    }
    const key = `conv:${conversation._id}`;
    const settings = await ChatRoomSettings.findOne({ roomKey: key }).lean();
    return buildRoom(user, {
      type: conversation.kind === "direct" ? "direct" : "group",
      key,
      socketRoom: `conversation:${conversation._id}`,
      teamId: conversation.teamId,
      conversationId: String(conversation._id),
      eventId: null,
      conversation,
      label: conversation.name,
      announcementOnly: Boolean(settings?.announcementOnly),
    });
  }

  if (eventId) {
    if (!isValidId(eventId)) return null;
    const event = await Event.findById(eventId).lean();
    if (!event || !(await canAccessTeam(user, event.teamId))) return null;
    const key = `event:${event._id}`;
    const settings = await ChatRoomSettings.findOne({ roomKey: key }).lean();
    return buildRoom(user, {
      type: "event",
      key,
      socketRoom: `event:${event._id}`,
      teamId: event.teamId,
      conversationId: null,
      eventId: String(event._id),
      event,
      label: event.title,
      announcementOnly: Boolean(settings?.announcementOnly),
    });
  }

  if (!teamId || !isValidId(teamId)) return null;
  if (!(await canAccessTeam(user, teamId))) return null;
  const key = `team:${teamId}`;
  const settings = await ChatRoomSettings.findOne({ roomKey: key }).lean();
  return buildRoom(user, {
    type: "team",
    key,
    // The original socket room name for the whole-team chat is the bare team
    // id; kept so older clients and the photo upload keep working.
    socketRoom: String(teamId),
    teamId,
    conversationId: null,
    eventId: null,
    label: "Team chat",
    announcementOnly: Boolean(settings?.announcementOnly),
  });
}

// Mongo filter that selects exactly this room's messages.
function roomFilter(room) {
  return {
    teamId: room.teamId,
    conversationId: room.conversationId || null,
    eventId: room.eventId || null,
  };
}

// Everyone on a team: its players, its coaches, and the parents linked to its
// roster. Unlike findTeamContacts this keeps test accounts, because they are
// real members for permissions, @mentions and "seen by"; notification code
// filters them out itself so they never trigger real email or push.
async function findTeamMembers(teamId) {
  const roster = await Player.find({ teamId }, "_id removedFromRoster").lean();
  const removedIds = roster.filter((p) => p.removedFromRoster).map((p) => p._id);
  // Removed players whose family is still enrolled keep their place (see
  // canAccessTeam in ownership.js); the rest are out.
  const stillEnrolled = new Set(
    (removedIds.length
      ? await Registration.distinct("playerId", { playerId: { $in: removedIds }, status: { $ne: "withdrawn" } })
      : []
    ).map(String)
  );
  const activeIds = roster
    .filter((p) => !p.removedFromRoster || stillEnrolled.has(String(p._id)))
    .map((p) => p._id);
  const blocked = new Set(removedIds.map(String).filter((id) => !stillEnrolled.has(id)));
  const activeSet = new Set(activeIds.map(String));

  const users = await User.find({
    $or: [{ teamId }, { children: { $in: activeIds } }, { playerId: { $in: activeIds } }],
  })
    .select("name email role avatar teamId children playerId isTestAccount")
    .lean();

  return users.filter((u) => {
    if (u.role === "player") return !(u.playerId && blocked.has(String(u.playerId)));
    if (u.role === "parent") {
      const kids = (u.children || []).map(String);
      const onTeamActive = kids.some((id) => activeSet.has(id));
      const onTeamBlocked = kids.some((id) => blocked.has(id));
      return onTeamActive || !onTeamBlocked;
    }
    return true;
  });
}

// The people who belong in a room (for notifications, @mentions, "seen by").
async function getRoomMembers(room) {
  if (room.type === "team" || room.type === "event") {
    return findTeamMembers(room.teamId);
  }
  return User.find({ _id: { $in: room.conversation.memberIds } })
    .select("name email role avatar teamId children playerId isTestAccount")
    .lean();
}

// A readable label for each person in a picker: a parent is shown as
// "Player — Parent name" so a coach can find "that player's parent".
async function labelUsers(users) {
  const childIds = [...new Set(users.flatMap((u) => (u.children || []).map(String)))];
  const players = childIds.length ? await Player.find({ _id: { $in: childIds } }, "name").lean() : [];
  const nameById = new Map(players.map((p) => [String(p._id), p.name]));
  return new Map(
    users.map((u) => {
      if (u.role !== "parent") return [String(u._id), u.name];
      const kids = (u.children || []).map((id) => nameById.get(String(id))).filter(Boolean);
      return [String(u._id), kids.length ? `${kids.join(" & ")} — ${u.name}` : u.name];
    })
  );
}

// "Team chat", the group's name, the event title, or for a direct message the
// other person's name, as seen by `viewer`.
function roomDisplayName(room, viewerId, members = []) {
  if (room.type !== "direct") return room.label;
  const others = members.filter((m) => String(m._id) !== String(viewerId));
  const names = others.map((m) => m.name);
  if (names.length <= 2) return names.join(", ") || "Direct message";
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

module.exports = {
  resolveRoom,
  roomFilter,
  isModerator,
  getRoomMembers,
  findTeamMembers,
  roomDisplayName,
  labelUsers,
  isValidId,
};
