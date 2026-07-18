const User = require("./model");

const requestCollegeCoachAccess = async (req, res) => {
  const { organization } = req.body;

  if (!organization || !organization.trim()) {
    return res.status(400).json({ message: "organization is required" });
  }
  if (req.user.collegeCoachStatus === "pending") {
    return res.status(409).json({ message: "Request already pending" });
  }
  if (req.user.collegeCoachStatus === "approved") {
    return res.status(409).json({ message: "Already approved" });
  }

  try {
    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        collegeCoachStatus: "pending",
        collegeCoachOrganization: organization.trim(),
        collegeCoachRequestedAt: new Date(),
      },
      { new: true }
    );
    return res.status(201).json({
      collegeCoachStatus: user.collegeCoachStatus,
      collegeCoachOrganization: user.collegeCoachOrganization,
    });
  } catch (err) {
    console.error("Request college coach access error:", err);
    return res.status(500).json({ message: "Failed to submit request" });
  }
};

const listPendingCollegeCoachRequests = async (req, res) => {
  try {
    const pending = await User.find({ collegeCoachStatus: "pending" }).select(
      "name email collegeCoachOrganization collegeCoachRequestedAt"
    );
    return res.json(pending);
  } catch (err) {
    console.error("List pending college coach requests error:", err);
    return res.status(500).json({ message: "Failed to fetch pending requests" });
  }
};

// Role is flipped to "college_coach" ONLY here, at approval time — see the
// comment on User.collegeCoachStatus for why this ordering matters.
const approveCollegeCoach = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      {
        role: "college_coach",
        collegeCoachStatus: "approved",
        collegeCoachReviewedAt: new Date(),
        collegeCoachReviewedBy: req.user._id,
      },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ role: user.role, collegeCoachStatus: user.collegeCoachStatus });
  } catch (err) {
    console.error("Approve college coach error:", err);
    return res.status(500).json({ message: "Failed to approve request" });
  }
};

const rejectCollegeCoach = async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findByIdAndUpdate(
      userId,
      {
        collegeCoachStatus: "rejected",
        collegeCoachReviewedAt: new Date(),
        collegeCoachReviewedBy: req.user._id,
      },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json({ collegeCoachStatus: user.collegeCoachStatus });
  } catch (err) {
    console.error("Reject college coach error:", err);
    return res.status(500).json({ message: "Failed to reject request" });
  }
};

module.exports = {
  requestCollegeCoachAccess,
  listPendingCollegeCoachRequests,
  approveCollegeCoach,
  rejectCollegeCoach,
};
