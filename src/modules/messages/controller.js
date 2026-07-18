const mongoose = require("mongoose");
const Message = require("./model");

/**
 * GET /api/messages/:teamId
 */
const getTeamMessages = async (req, res) => {
  try {
    const { teamId } = req.params;
    const { user } = req;

    // ✅ Validate ObjectId first
    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({
        message: "Invalid teamId",
      });
    }
    // ❌ User not on a team
    if (!user.teamId) {
      return res.status(403).send({ message: "Not assigned to a team" });
    }

    // ❌ User trying to access another team's chat
    if (user.teamId.toString() !== teamId) {
      return res.status(403).send({ message: "Access denied" });
    }
    const messages = await Message.find({ teamId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json(messages.reverse());
  } catch (err) {
    console.error("❌ Error fetching messages:", err);
    return res.status(500).json({ message: "Failed to load messages" });
  }
};

module.exports = {
  getTeamMessages,
};
