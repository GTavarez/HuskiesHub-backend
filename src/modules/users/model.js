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
  teamId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Team",
    default: null,
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
});

// ⭐ LOGIN CHECK
userSchema.statics.findUserByCredentials = async function findUserByCredentials(
  email,
  password
) {
  const user = await this.findOne({ email }).select("+password");
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
