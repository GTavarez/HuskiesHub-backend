const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ⭐ Use Cloud Run environment variable
const { JWT_SECRET } = process.env;

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    minlength: 2,
    maxLength: 30,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    // Normalized so "Name@Gmail.com" and "name@gmail.com" can't create two
    // separate accounts for the same person.
    lowercase: true,
    trim: true,
    validate: {
      validator: (value) => validator.isEmail(value),
      message: "You must enter a valid email",
    },
  },
  password: {
    type: String,
    required: true,
    select: false,
  },
  avatar: {
    type: String,
    default: "",
  },
  phone: {
    type: String,
    default: "",
  },
  bio: {
    type: String,
    default: "",
  },
  // Display title on the public Coaches page (e.g. "Head Coach", "Pitching
  // Coach") — the role enum itself only distinguishes coach/admin/etc, not
  // this finer-grained public-facing label.
  coachTitle: {
    type: String,
    default: "",
  },
  // Explicit opt-in for the public "Coaching Staff" page — role alone isn't
  // enough, since not every admin account (e.g. internal/dev access) is
  // actual public-facing coaching staff.
  showOnCoachesPage: {
    type: Boolean,
    default: false,
  },
  // Set true on admin-provisioned accounts (e.g. a shared temp password) so
  // the frontend can force a password change before letting them use the app.
  mustChangePassword: {
    type: Boolean,
    default: false,
  },
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
    default: null,
  },
  // Admin-only opt-in: also cc'd on every team's schedule notification
  // emails (new/edited/cancelled game or practice), not just their own
  // team's — for spotting formatting/timing issues across every team at
  // once. Deliberately scoped to schedule emails only, not announcements,
  // chat digests, or the team Contacts list — those would just add noise.
  watchAllScheduleEmails: {
    type: Boolean,
    default: false,
  },
  // Automated-QA accounts only. Anything one of these accounts does must
  // never email a real person (no team announcement, no admin oversight
  // copy), and these accounts are never emailed themselves. Set by hand in
  // the database; there is deliberately no API to flip it.
  isTestAccount: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    enum: ["player", "coach", "admin", "fan", "parent", "college_coach"],
    default: "fan",
  },
  // populated for role: "player" — links this account to its roster entry
  playerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Player",
    default: null,
  },
  // populated for role: "parent" — links this account to one or more children's roster entries
  children: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
    },
  ],
  // Stripe references only — never store raw card data on this or any model.
  stripeCustomerId: { type: String, default: null },
  defaultPaymentMethodId: { type: String, default: null },
  // College-coach access request/approval state. IMPORTANT: role is only ever
  // flipped to "college_coach" at approval time (see collegeCoachController.js),
  // never at request time — this is what keeps a pending applicant from
  // passing requireRole/routeConfig-based gates. Do not set role here.
  collegeCoachStatus: {
    type: String,
    enum: ["none", "pending", "approved", "rejected"],
    default: "none",
  },
  collegeCoachOrganization: { type: String, default: "" },
  collegeCoachRequestedAt: { type: Date, default: null },
  collegeCoachReviewedAt: { type: Date, default: null },
  collegeCoachReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  // Player/parent/coach role verification request/approval state. Mirrors the
  // college-coach block above: role only ever flips at approval time (see
  // roleRequestController.js), never at request time. Only a "fan" can submit
  // one — see submitRoleRequest.
  roleRequestType: {
    type: String,
    enum: ["none", "player", "coach", "parent"],
    default: "none",
  },
  roleRequestStatus: {
    type: String,
    enum: ["none", "pending", "approved", "rejected"],
    default: "none",
  },
  // player: exactly 1 entry; parent: 1+ entries; coach: unused (empty)
  roleRequestPlayerIds: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
    },
  ],
  // coach only
  roleRequestTeamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
    default: null,
  },
  roleRequestRequestedAt: { type: Date, default: null },
  roleRequestReviewedAt: { type: Date, default: null },
  roleRequestReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  // Password reset — only ever a hash of the emailed token is stored, never
  // the raw token itself, so a DB read alone can't be used to reset a password.
  resetPasswordTokenHash: { type: String, default: null, select: false },
  resetPasswordExpires: { type: Date, default: null },
});

// ⭐ LOGIN CHECK
userSchema.statics.findUserByCredentials = async function findUserByCredentials(
  email,
  password
) {
  const user = await this.findOne({ email: (email || "").trim().toLowerCase() }).select(
    "+password"
  );
  if (!user) {
    throw new Error("Incorrect email or password");
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error("Incorrect email or password");
  }

  return user;
};

// ⭐ JWT TOKEN GENERATION — FIXED FOR CLOUD RUN
userSchema.methods.generateAuthToken = function generateAuthToken() {
  if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET is missing in environment!");
    throw new Error("Server error: JWT SECRET missing");
  }

  return jwt.sign({ _id: this._id }, JWT_SECRET, { expiresIn: "7d" });
};

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
