
const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ⭐ Use Cloud Run environment variable
const JWT_SECRET = process.env.JWT_SECRET;

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
});

// ⭐ LOGIN CHECK
userSchema.statics.findUserByCredentials = async function (email, password) {
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
userSchema.methods.generateAuthToken = function () {
  if (!JWT_SECRET) {
    console.error("❌ JWT_SECRET is missing in environment!");
    throw new Error("Server error: JWT SECRET missing");
  }

  return jwt.sign({ _id: this._id }, JWT_SECRET, { expiresIn: "7d" });
};

module.exports = mongoose.model("User", userSchema);
