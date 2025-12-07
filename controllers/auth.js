const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/auth");

const signup = async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).send({ message: "Missing required fields" });
    }

    if (password !== confirmPassword) {
      return res.status(400).send({ message: "Passwords do not match" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
    });

    const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    return res.status(201).send({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (err) {
    console.error("Signup error:", err);
    return res.status(500).send({ message: "Internal server error" });
  }
};

const signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findUserByCredentials(email, password);

    const token = user.generateAuthToken(); // ⭐ use model method

    res.status(200).send({ token });
  } catch (error) {
    res.status(401).send({ message: error.message });
  }
};
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    return res.status(200).send({
      _id: user._id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
    });
  } catch (err) {
    console.error("Get current user error:", err);
    return res.status(500).send({ message: "Internal server error" });
  }
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
    console.log(updatedUser);
    return res.status(200).send({
      avatar: updatedUser.avatar,
    });
  } catch (err) {
    console.error("Avatar upload error:", err);
    return res.status(500).send({ message: "Internal server error" });
  }
};

module.exports = {
  signup,
  signin,
  getCurrentUser,
  updateUserProfile,
  uploadAvatar,
};
