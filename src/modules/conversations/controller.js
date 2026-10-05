const mongoose = require("mongoose");
const Conversation = require("./model");
const User = require("../users/model");
const { canAccessTeam } = require("../../common/utils/ownership");
const { findTeamMembers, resolveRoom, labelUsers } = require("../../common/utils/chatRooms");
const { evaluateDirectMessage } = require("./dmPolicy");
const { listMessages } = require("../chat/chatService");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Adds `members` ({_id, name, role}) to each conversation so the client can
// show who is in a chat, and name a direct message after the other person.
async function withMembers(conversations) {
  const ids = [...new Set(conversations.flatMap((c) => c.memberIds.map(String)))];
  const users = await User.find({ _id: { $in: ids } })
    .select("name role")
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), { _id: u._id, name: u.name, role: u.role }]));
  return conversations.map((c) => ({
    ...c,
    members: c.memberIds.map((id) => byId.get(String(id))).filter(Boolean),
  }));
}

// Disconnects a removed person's live connections to a room, so they stop
// receiving messages straight away.
async function kickFromRoom(io, room, userId) {
  if (!io) return;
  const sockets = await io.in(room.socketRoom).fetchSockets();
  sockets
    .filter((s) => s.data.user && String(s.data.user._id) === String(userId))
    .forEach((s) => s.disconnect());
}

/**
 * POST /api/conversations  { teamId, name, memberIds }
 * Coach/admin only. memberIds is validated against the team's own people — a
 * coach can't add someone from another team. The creator is always added.
 */
const createConversation = async (req, res) => {
  const { teamId, name, memberIds } = req.body;
  const { user } = req;

  if (!isValidId(teamId)) {
    return res.status(400).json({ message: "Invalid teamId" });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ message: "Name is required" });
  }
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ message: "Pick at least one member" });
  }

  if (!(await canAccessTeam(user, teamId))) {
    return res.status(403).json({ message: "Access denied" });
  }

  try {
    const members = await findTeamMembers(teamId);
    const validIds = new Set(members.map((m) => String(m._id)));
    validIds.add(String(user._id));

    const invalid = memberIds.filter((id) => !validIds.has(String(id)));
    if (invalid.length > 0) {
      return res.status(400).json({ message: "One or more members aren't on this team" });
    }

    const uniqueMemberIds = [...new Set([...memberIds.map(String), String(user._id)])];

    const conversation = await Conversation.create({
      teamId,
      name: name.trim(),
      kind: "group",
      createdBy: user._id,
      memberIds: uniqueMemberIds,
    });

    const [withNames] = await withMembers([conversation.toObject()]);
    return res.status(201).json(withNames);
  } catch (err) {
    console.error("Create conversation error:", err);
    return res.status(500).json({ message: "Failed to create group chat" });
  }
};

/**
 * GET /api/conversations?teamId=optional
 * Every group chat and direct message the current user belongs to.
 */
const listMyConversations = async (req, res) => {
  const { teamId } = req.query;
  const { user } = req;

  const filter = { memberIds: user._id };
  if (teamId) {
    if (!isValidId(teamId)) {
      return res.status(400).json({ message: "Invalid teamId" });
    }
    filter.teamId = teamId;
  }

  try {
    const conversations = await Conversation.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(await withMembers(conversations));
  } catch (err) {
    console.error("List conversations error:", err);
    return res.status(500).json({ message: "Failed to load group chats" });
  }
};

/**
 * GET /api/conversations/:id/messages?before=<messageId>&limit=
 */
const getConversationMessages = async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ message: "Invalid conversation id" });
  }

  try {
    const room = await resolveRoom(req.user, { conversationId: id });
    if (!room) return res.status(403).json({ message: "Access denied" });
    return res.json(await listMessages(room, req.query));
  } catch (err) {
    console.error("Get conversation messages error:", err);
    return res.status(500).json({ message: "Failed to load messages" });
  }
};

// Loads a group chat the caller is a coach/admin member of.
async function loadManagedGroup(req, res) {
  const { id } = req.params;
  if (!isValidId(id)) {
    res.status(400).json({ message: "Invalid conversation id" });
    return null;
  }
  const room = await resolveRoom(req.user, { conversationId: id });
  if (!room) {
    res.status(403).json({ message: "Access denied" });
    return null;
  }
  if (room.type !== "group") {
    res.status(400).json({ message: "That isn't a group chat." });
    return null;
  }
  if (!room.moderator) {
    res.status(403).json({ message: "Only a coach or admin in this group can change it." });
    return null;
  }
  return room;
}

/**
 * PATCH /api/conversations/:id  { name }
 */
const renameConversation = async (req, res) => {
  const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
  if (!name || name.length > 100) {
    return res.status(400).json({ message: "Give the group a name (100 characters or fewer)." });
  }
  try {
    const room = await loadManagedGroup(req, res);
    if (!room) return null;
    await Conversation.updateOne({ _id: room.conversationId }, { $set: { name } });
    return res.json({ _id: room.conversationId, name });
  } catch (err) {
    console.error("Rename conversation error:", err);
    return res.status(500).json({ message: "Failed to rename the group" });
  }
};

/**
 * POST /api/conversations/:id/members  { memberIds }
 */
const addMembers = async (req, res) => {
  const { memberIds } = req.body;
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ message: "Pick at least one person to add." });
  }
  try {
    const room = await loadManagedGroup(req, res);
    if (!room) return null;

    const teamMembers = await findTeamMembers(room.teamId);
    const valid = new Set(teamMembers.map((m) => String(m._id)));
    if (!memberIds.every((id) => valid.has(String(id)))) {
      return res.status(400).json({ message: "One or more people aren't on this team" });
    }

    await Conversation.updateOne(
      { _id: room.conversationId },
      { $addToSet: { memberIds: { $each: memberIds } } }
    );
    const [updated] = await withMembers([await Conversation.findById(room.conversationId).lean()]);
    return res.json(updated);
  } catch (err) {
    console.error("Add conversation members error:", err);
    return res.status(500).json({ message: "Failed to add people" });
  }
};

/**
 * DELETE /api/conversations/:id/members/:userId
 * The person who created the group can't be removed, so a group can never end
 * up with nobody running it.
 */
const removeMember = async (req, res) => {
  const { userId } = req.params;
  if (!isValidId(userId)) {
    return res.status(400).json({ message: "Invalid userId" });
  }
  try {
    const room = await loadManagedGroup(req, res);
    if (!room) return null;
    if (String(room.conversation.createdBy) === String(userId)) {
      return res.status(400).json({ message: "The person who made the group can't be removed." });
    }
    await Conversation.updateOne({ _id: room.conversationId }, { $pull: { memberIds: userId } });
    await kickFromRoom(req.app.get("io"), room, userId);
    const [updated] = await withMembers([await Conversation.findById(room.conversationId).lean()]);
    return res.json(updated);
  } catch (err) {
    console.error("Remove conversation member error:", err);
    return res.status(500).json({ message: "Failed to remove that person" });
  }
};

/**
 * GET /api/conversations/dm-candidates?teamId=
 * The people the caller may start a private message with on this team.
 */
const listDirectMessageCandidates = async (req, res) => {
  const { teamId } = req.query;
  if (!isValidId(teamId)) {
    return res.status(400).json({ message: "Invalid teamId" });
  }
  try {
    if (!(await canAccessTeam(req.user, teamId))) {
      return res.status(403).json({ message: "Access denied" });
    }
    const members = await findTeamMembers(teamId);
    const checks = await Promise.all(
      members.map(async (member) => ({ member, result: await evaluateDirectMessage(req.user, member) }))
    );
    const allowed = checks.filter((c) => c.result.ok).map((c) => c.member);
    const labels = await labelUsers(allowed);
    return res.json(
      allowed
        .map((m) => ({
          _id: m._id,
          name: m.name,
          role: m.role,
          label: labels.get(String(m._id)),
          // Tells the picker a parent will be included, so it can say so.
          includesParents: m.role === "player" || req.user.role === "player",
        }))
        .sort((a, b) => a.label.localeCompare(b.label))
    );
  } catch (err) {
    console.error("List DM candidates error:", err);
    return res.status(500).json({ message: "Failed to load people" });
  }
};

/**
 * POST /api/conversations/direct  { teamId, otherUserId }
 * Starts (or returns the existing) private message. If a player is involved,
 * their parent(s) are added as members automatically.
 */
const createDirectConversation = async (req, res) => {
  const { teamId, otherUserId } = req.body;
  const { user } = req;
  if (!isValidId(teamId) || !isValidId(otherUserId)) {
    return res.status(400).json({ message: "teamId and otherUserId are required" });
  }

  try {
    if (!(await canAccessTeam(user, teamId))) {
      return res.status(403).json({ message: "Access denied" });
    }
    const members = await findTeamMembers(teamId);
    const target = members.find((m) => String(m._id) === String(otherUserId));
    if (!target) {
      return res.status(400).json({ message: "That person isn't on this team." });
    }

    const result = await evaluateDirectMessage(user, target);
    if (!result.ok) {
      return res.status(403).json({ message: result.reason });
    }

    const memberIds = [
      ...new Set([String(user._id), String(target._id), ...result.guardians.map((g) => String(g._id))]),
    ];

    let conversation = await Conversation.findOne({
      teamId,
      kind: "direct",
      memberIds: { $all: memberIds, $size: memberIds.length },
    }).lean();

    let created = false;
    if (!conversation) {
      const doc = await Conversation.create({
        teamId,
        kind: "direct",
        name: `${user.name} & ${target.name}`,
        createdBy: user._id,
        memberIds,
      });
      conversation = doc.toObject();
      created = true;
    }

    const [withNames] = await withMembers([conversation]);
    return res.status(created ? 201 : 200).json(withNames);
  } catch (err) {
    console.error("Create direct conversation error:", err);
    return res.status(500).json({ message: "Failed to start the message" });
  }
};

module.exports = {
  createConversation,
  listMyConversations,
  getConversationMessages,
  renameConversation,
  addMembers,
  removeMember,
  listDirectMessageCandidates,
  createDirectConversation,
};
