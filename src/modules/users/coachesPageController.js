const mongoose = require("mongoose");
const User = require("./model");

// Who appears on the public "Coaching Staff" page is an explicit opt-in per
// account (showOnCoachesPage), because not every coach or admin login is
// public-facing staff. This is the admin-facing way to change it.

const MAX_TITLE_LENGTH = 80;

// GET /admin/coaches-page
// Every coach or admin account, with whether it is currently shown.
const listCoachesPageAccounts = async (req, res) => {
  try {
    const users = await User.find({
      role: { $in: ["coach", "admin"] },
      isTestAccount: { $ne: true },
    })
      .select("name email role coachTitle showOnCoachesPage bio avatar teamId")
      .populate({ path: "teamId", select: "name" })
      .sort({ name: 1 })
      .lean();
    return res.json(
      users.map((u) => ({
        _id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        coachTitle: u.coachTitle || "",
        showOnCoachesPage: Boolean(u.showOnCoachesPage),
        hasBio: Boolean(u.bio),
        hasPhoto: Boolean(u.avatar),
        teamName: u.teamId?.name || "",
      }))
    );
  } catch (err) {
    console.error("List coaches page accounts error:", err);
    return res.status(500).json({ message: "Failed to fetch coaches" });
  }
};

// PATCH /admin/users/:userId/coaches-page  { show?: boolean, coachTitle?: string }
const updateCoachesPageEntry = async (req, res) => {
  const { userId } = req.params;
  const { show, coachTitle } = req.body;

  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid userId" });
  }
  if (show !== undefined && typeof show !== "boolean") {
    return res.status(400).json({ message: "show must be true or false" });
  }
  if (coachTitle !== undefined) {
    if (typeof coachTitle !== "string" || coachTitle.trim().length > MAX_TITLE_LENGTH) {
      return res.status(400).json({ message: `Title must be ${MAX_TITLE_LENGTH} characters or fewer` });
    }
  }
  if (show === undefined && coachTitle === undefined) {
    return res.status(400).json({ message: "Nothing to change" });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!["coach", "admin"].includes(user.role)) {
      return res.status(400).json({ message: "Only coach or admin accounts can be on the coaches page." });
    }

    if (show !== undefined) user.showOnCoachesPage = show;
    if (coachTitle !== undefined) user.coachTitle = coachTitle.trim();
    await user.save();
    return res.json({
      _id: user._id,
      name: user.name,
      coachTitle: user.coachTitle || "",
      showOnCoachesPage: Boolean(user.showOnCoachesPage),
    });
  } catch (err) {
    console.error("Update coaches page entry error:", err);
    return res.status(500).json({ message: "Failed to update" });
  }
};

module.exports = { listCoachesPageAccounts, updateCoachesPageEntry };
