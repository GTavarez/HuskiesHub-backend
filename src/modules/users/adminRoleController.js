const mongoose = require("mongoose");
const User = require("./model");

// Deliberately narrow — not a general role editor. A parent/player/coach role
// carries linked data (children, playerId, teamId) that a free-form role
// switch could corrupt; admin has none of that, so only admin promotion and
// its reversal are supported here.
const PROMOTABLE_ROLES = ["coach", "parent", "player", "fan"];

/**
 * POST /admin/users/:userId/promote-to-admin
 * Grants full admin access to an existing account. Admin is the highest-trust
 * role in the app — it can read every family's private data, send real money
 * through Stripe payouts, and delete anything — so this is admin-only, and the
 * account's role before promotion is recorded so a later demotion restores it
 * instead of guessing.
 */
const promoteToAdmin = async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid userId" });
  }
  if (userId === req.user._id.toString()) {
    return res.status(400).json({ message: "You can't change your own role here." });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role === "admin") {
      return res.status(409).json({ message: `${user.name} is already an admin.` });
    }
    if (!PROMOTABLE_ROLES.includes(user.role)) {
      return res.status(400).json({ message: `Can't promote a ${user.role} account to admin this way.` });
    }

    user.previousRoleBeforeAdmin = user.role;
    user.role = "admin";
    await user.save();
    return res.json({ _id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    console.error("Promote to admin error:", err);
    return res.status(500).json({ message: "Failed to promote user" });
  }
};

/**
 * POST /admin/users/:userId/demote-admin
 * Reverses promoteToAdmin, restoring the role the account had before.
 */
const demoteAdmin = async (req, res) => {
  const { userId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(userId)) {
    return res.status(400).json({ message: "Invalid userId" });
  }
  if (userId === req.user._id.toString()) {
    return res.status(400).json({ message: "You can't change your own role here." });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "admin") {
      return res.status(409).json({ message: `${user.name} is not an admin.` });
    }
    if (!user.previousRoleBeforeAdmin) {
      return res.status(400).json({
        message: `${user.name} wasn't promoted through this flow, so there's no role on record to restore. Set their role by hand.`,
      });
    }

    user.role = user.previousRoleBeforeAdmin;
    user.previousRoleBeforeAdmin = null;
    await user.save();
    return res.json({ _id: user._id, name: user.name, email: user.email, role: user.role });
  } catch (err) {
    console.error("Demote admin error:", err);
    return res.status(500).json({ message: "Failed to demote user" });
  }
};

module.exports = { promoteToAdmin, demoteAdmin };
