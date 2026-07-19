const mongoose = require("mongoose");
const User = require("./model");
const Player = require("../players/model");
const Team = require("../teams/model");
const { getTransporter } = require("../../common/utils/mailer");

const REQUESTABLE_ROLES = ["player", "coach", "parent"];

async function notifyAdminOfRoleRequest(user) {
  try {
    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
    const toEmail = process.env.CONTACT_TO_EMAIL;
    if (!toEmail) return;

    await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: "HuskiesHub — new role request pending approval",
      text: `${user.name} (${user.email}) requested to become a "${user.roleRequestType}". Review it in the admin dashboard's Role Requests tab.`,
    });
  } catch (err) {
    console.warn("Role request notification email not sent:", err.message);
  }
}

// Only a "fan" may submit a role request — this is what keeps a user who
// already has a real role (or an already-pending/approved requester) from
// resubmitting. teamId/playerIds are never trusted beyond existence checks;
// the actual role/links are only ever set at approval time, below.
const submitRoleRequest = async (req, res) => {
  const { roleRequestType, playerIds, teamId } = req.body;

  if (!REQUESTABLE_ROLES.includes(roleRequestType)) {
    return res.status(400).json({ message: "roleRequestType must be player, coach, or parent" });
  }
  if (req.user.role !== "fan") {
    return res.status(403).json({ message: "Only accounts without a role yet can request one" });
  }
  if (req.user.roleRequestStatus === "pending") {
    return res.status(409).json({ message: "A role request is already pending" });
  }

  try {
    const update = {
      roleRequestType,
      roleRequestStatus: "pending",
      roleRequestRequestedAt: new Date(),
      roleRequestPlayerIds: [],
      roleRequestTeamId: null,
    };

    if (roleRequestType === "coach") {
      if (!teamId || !mongoose.Types.ObjectId.isValid(teamId)) {
        return res.status(400).json({ message: "Valid teamId is required" });
      }
      const team = await Team.findById(teamId);
      if (!team) return res.status(404).json({ message: "Team not found" });
      update.roleRequestTeamId = teamId;
    } else {
      const ids = Array.isArray(playerIds) ? playerIds : [];
      const validCount = roleRequestType === "player" ? ids.length === 1 : ids.length >= 1;
      if (!validCount || !ids.every((id) => mongoose.Types.ObjectId.isValid(id))) {
        return res.status(400).json({
          message:
            roleRequestType === "player"
              ? "Exactly one playerId is required"
              : "At least one playerId is required",
        });
      }
      const players = await Player.find({ _id: { $in: ids } });
      if (players.length !== ids.length) {
        return res.status(404).json({ message: "One or more players not found" });
      }
      update.roleRequestPlayerIds = ids;
    }

    const user = await User.findByIdAndUpdate(req.user._id, update, { new: true });
    await notifyAdminOfRoleRequest(user);

    return res.status(201).json({
      roleRequestType: user.roleRequestType,
      roleRequestStatus: user.roleRequestStatus,
    });
  } catch (err) {
    console.error("Submit role request error:", err);
    return res.status(500).json({ message: "Failed to submit role request" });
  }
};

const listPendingRoleRequests = async (req, res) => {
  try {
    const pending = await User.find({ roleRequestStatus: "pending" })
      .select("name email roleRequestType roleRequestPlayerIds roleRequestTeamId roleRequestRequestedAt")
      .populate("roleRequestPlayerIds", "name jersey teamId")
      .populate("roleRequestTeamId", "name ageGroup");
    return res.json(pending);
  } catch (err) {
    console.error("List pending role requests error:", err);
    return res.status(500).json({ message: "Failed to fetch pending requests" });
  }
};

// Role is flipped ONLY here, at approval time. Branches on the requester's
// chosen roleRequestType to decide which link fields (playerId/children/teamId)
// to set — see the comment on User.roleRequestType for why this ordering matters.
const approveRoleRequest = async (req, res) => {
  const { userId } = req.params;

  try {
    const requester = await User.findById(userId);
    if (!requester) return res.status(404).json({ message: "User not found" });
    if (requester.roleRequestStatus !== "pending") {
      return res.status(409).json({ message: "This request is not pending" });
    }

    const update = {
      roleRequestStatus: "approved",
      roleRequestReviewedAt: new Date(),
      roleRequestReviewedBy: req.user._id,
    };

    if (requester.roleRequestType === "player") {
      const player = await Player.findById(requester.roleRequestPlayerIds[0]);
      if (!player) return res.status(404).json({ message: "Requested player not found" });
      update.role = "player";
      update.playerId = player._id;
      update.teamId = player.teamId;
    } else if (requester.roleRequestType === "parent") {
      update.role = "parent";
      update.children = requester.roleRequestPlayerIds;
    } else if (requester.roleRequestType === "coach") {
      update.role = "coach";
      update.teamId = requester.roleRequestTeamId;
    }

    const user = await User.findByIdAndUpdate(userId, update, { new: true });
    return res.json({ role: user.role, roleRequestStatus: user.roleRequestStatus });
  } catch (err) {
    console.error("Approve role request error:", err);
    return res.status(500).json({ message: "Failed to approve request" });
  }
};

const rejectRoleRequest = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      {
        roleRequestStatus: "rejected",
        roleRequestReviewedAt: new Date(),
        roleRequestReviewedBy: req.user._id,
      },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ roleRequestStatus: user.roleRequestStatus });
  } catch (err) {
    console.error("Reject role request error:", err);
    return res.status(500).json({ message: "Failed to reject request" });
  }
};

module.exports = {
  submitRoleRequest,
  listPendingRoleRequests,
  approveRoleRequest,
  rejectRoleRequest,
};
