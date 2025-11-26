const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/auth.js");
const { JWT_SECRET } = require("../utils/config.js");
require("dotenv").config();


const signup = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).send({ message: "Missing required fields" });
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .send({ message: "Passwords do not match" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword, // ONLY ONE PASSWORD
    });

    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    res.status(201).send({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).send({ message: "Internal server error" });
  }
};


const signin = (req, res) => {
  const { email, password } = req.body;
  return User.findUserByCredentials(email, password)
    .then((user) => {
      console.log(user);
      const token = jwt.sign({ _id: user._id }, JWT_SECRET, {
        expiresIn: "7d",
      });
      res.status(200).send({ token });
    })
    .catch((error) => {
      res.status(401).send({ message: error.message });
    });
};
const updateUserProfile = async (req, res) => {
  const { name, avatar } = req.body;
  const { _id: userId } = req.user;

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { name, avatar },
      { new: true, runValidators: true }
    ).orFail();

    res.status(200).send({
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        avatar: updatedUser.avatar,
      },
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).send({ message: "Internal server error" });
  }
};
const uploadAvatar = async (req, res) => {
  const { _id: userId } = req.user;

  if (!req.file) {
    return res.status(400).send({ message: "No file uploaded" });
  }

  const avatarUrl = `/uploads/avatars/${req.file.filename}`;

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { avatar: avatarUrl },
      { new: true, runValidators: true }
    ).orFail();

    res.status(200).send({
      avatar: updatedUser.avatar,
    });
  } catch (err) {
    console.error("Avatar upload error:", err);
    res.status(500).send({ message: "Internal server error" });
  }
};

module.exports = {
  signup,
  signin,
  getCurrentUser,
  updateUserProfile,
  uploadAvatar,
};
