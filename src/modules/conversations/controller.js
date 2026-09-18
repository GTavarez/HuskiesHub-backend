const mongoose = require("mongoose");
const Conversation = require("./model");
const Message = require("../messages/model");
const { canAccessTeam, canAccessConversation } = require("../../common/utils/ownership");
const { findTeamContacts } = require("../../common/utils/teamContacts");

/**
 * POST /api/conversations  { teamId, name, memberIds }
 * Coach/admin only. memberIds is validated against the team's own contact
 * list (findTeamContacts) — a coach can't add someone from another team, and
 * can't be tricked into adding an id that isn't actually reachable on this
 * team. The creator is always added even if omitted, so they can never lock
 * themselves out of a group they just made.
 */
const createConversation = async (req, res) => {
  const { teamId, name, memberIds } = req.body;
  const { user } = req;

  if (!mongoose.Types.ObjectId.isValid(teamId)) {
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
    const contacts = await findTeamContacts(teamId);
    const validIds = new Set(contacts.map((c) => c._id.toString()));
    validIds.add(user._id.toString());

    const invalid = memberIds.filter((id) => !validIds.has(id.toString()));
    if (invalid.length > 0) {
      return res.status(400).json({ message: "One or more members aren't on this team" });
    }

    const uniqueMemberIds = [...new Set([...memberIds, user._id.toString()])];

    const conversation = await Conversation.create({
      teamId,
      name: name.trim(),
      createdBy: user._id,
      memberIds: uniqueMemberIds,
    });

    return res.status(201).json(conversation);
  } catch (err) {
    console.error("Create conversation error:", err);
    return res.status(500).json({ message: "Failed to create group chat" });
  }
};

/**
 * GET /api/conversations?teamId=optional
 * Every group chat the current user belongs to (optionally narrowed to one
 * team). Ordered by most-recently-created — no last-message preview yet.
 */
const listMyConversations = async (req, res) => {
  const { teamId } = req.query;
  const { user } = req;

  const filter = { memberIds: user._id };
  if (teamId) {
    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ message: "Invalid teamId" });
    }
    filter.teamId = teamId;
  }

  try {
    const conversations = await Conversation.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(conversations);
  } catch (err) {
    console.error("List conversations error:", err);
    return res.status(500).json({ message: "Failed to load group chats" });
  }
};

/**
 * GET /api/conversations/:id/messages
 */
const getConversationMessages = async (req, res) => {
  const { id } = req.params;
  const { user } = req;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid conversation id" });
  }

  try {
    const conversation = await Conversation.findById(id).lean();
    if (!conversation || !canAccessConversation(user, conversation)) {
      return res.status(403).json({ message: "Access denied" });
    }

    const messages = await Message.find({ conversationId: id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json(messages.reverse());
  } catch (err) {
    console.error("Get conversation messages error:", err);
    return res.status(500).json({ message: "Failed to load messages" });
  }
};

module.exports = { createConversation, listMyConversations, getConversationMessages };
