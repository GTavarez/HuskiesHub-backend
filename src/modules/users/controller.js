const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const crypto = require("crypto");
const { getBucket } = require("../../common/utils/gridfs");
const { getTransporter } = require("../../common/utils/mailer");

const User = require("./model");

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

const signup = async (req, res) => {
  try {
    const { name, email, password, confirmPassword, phone } = req.body;

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
      phone: phone || "",
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
        phone: user.phone,
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
    await user.populate([
      { path: "playerId" },
      { path: "children" },
      { path: "roleRequestPlayerIds", select: "name jersey teamId" },
      { path: "roleRequestTeamId", select: "name ageGroup" },
    ]);

    const token = user.generateAuthToken(); // ⭐ use model method

    res.status(200).send({
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        bio: user.bio,
        coachTitle: user.coachTitle,
        role: user.role,
        teamId: user.teamId,
        playerData: user.playerId || null,
        childrenData: user.children || [],
        collegeCoachStatus: user.collegeCoachStatus,
        roleRequestType: user.roleRequestType,
        roleRequestStatus: user.roleRequestStatus,
        roleRequestPlayerIds: user.roleRequestPlayerIds || [],
        roleRequestTeamId: user.roleRequestTeamId || null,
        mustChangePassword: user.mustChangePassword,
      },
    });
  } catch (error) {
    res.status(401).send({ message: error.message });
  }
};
// Always responds with the same generic message regardless of whether the
// email matched a user — prevents leaking which emails have accounts.
const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const genericMessage = "If that email exists, we've sent a password reset link.";

  if (!email) {
    return res.status(400).send({ message: "Email is required" });
  }

  try {
    const user = await User.findOne({ email: email.trim().toLowerCase() });
    if (user) {
      const rawToken = crypto.randomBytes(32).toString("hex");
      user.resetPasswordTokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      user.resetPasswordExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await user.save();

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
      const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

      try {
        const transporter = getTransporter();
        const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
        await transporter.sendMail({
          from: fromEmail,
          to: user.email,
          subject: "HuskiesHub — Reset your password",
          text: `Reset your password: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, you can ignore this email.`,
          html: `<p>Click below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">Reset Password</a></p><p>If you didn't request this, you can ignore this email.</p>`,
        });
      } catch (mailErr) {
        console.warn("Password reset email not sent:", mailErr.message);
      }
    }
    return res.status(200).send({ message: genericMessage });
  } catch (err) {
    console.error("Forgot password error:", err);
    return res.status(500).send({ message: "Internal server error" });
  }
};

const resetPassword = async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password || !confirmPassword) {
    return res.status(400).send({ message: "Missing required fields" });
  }
  if (password !== confirmPassword) {
    return res.status(400).send({ message: "Passwords do not match" });
  }
  if (password.length < 8) {
    return res.status(400).send({ message: "Password must be at least 8 characters" });
  }

  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      resetPasswordTokenHash: tokenHash,
      resetPasswordExpires: { $gt: new Date() },
    });
    if (!user) {
      return res.status(400).send({ message: "Invalid or expired reset link" });
    }

    user.password = await bcrypt.hash(password, 10);
    user.resetPasswordTokenHash = null;
    user.resetPasswordExpires = null;
    await user.save();

    return res.status(200).send({ message: "Password reset successful" });
  } catch (err) {
    console.error("Reset password error:", err);
    return res.status(500).send({ message: "Internal server error" });
  }
};

const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate([
      { path: "playerId" },
      { path: "children" },
      { path: "roleRequestPlayerIds", select: "name jersey teamId" },
      { path: "roleRequestTeamId", select: "name ageGroup" },
    ]);

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    return res.status(200).send({
      _id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      bio: user.bio,
      avatar: user.avatar,
      teamId: user.teamId,
      role: user.role,
      playerData: user.playerId || null,
      childrenData: user.children || [],
      collegeCoachStatus: user.collegeCoachStatus,
      roleRequestType: user.roleRequestType,
      roleRequestStatus: user.roleRequestStatus,
      roleRequestPlayerIds: user.roleRequestPlayerIds || [],
      roleRequestTeamId: user.roleRequestTeamId || null,
      mustChangePassword: user.mustChangePassword,
    });
  } catch (err) {
    console.error("Get current user error:", err);
    return res.status(500).send({ message: "Internal server error" });
  }
};

const updateUserProfile = async (req, res) => {
  const { name, avatar, phone, bio, coachTitle } = req.body;
  const { _id: userId } = req.user;

  const updates = { name, avatar };
  if (phone !== undefined) updates.phone = phone;
  if (bio !== undefined) updates.bio = bio;
  if (coachTitle !== undefined) updates.coachTitle = coachTitle;

  try {
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    ).orFail();

    res.status(200).send({
      user: {
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        phone: updatedUser.phone,
        bio: updatedUser.bio,
        coachTitle: updatedUser.coachTitle,
        avatar: updatedUser.avatar,
      },
    });
  } catch (err) {
    console.error("Profile update error:", err);
    res.status(500).send({ message: "Internal server error" });
  }
};

// Self-service password change while logged in — separate from the
// forgot-password email flow, which stays the recovery path for a lost
// password. Also clears mustChangePassword, so this is how an
// admin-provisioned temp password gets replaced.
const changePassword = async (req, res) => {
  const { currentPassword, newPassword, confirmNewPassword } = req.body;
  const { _id: userId } = req.user;

  if (!currentPassword || !newPassword || !confirmNewPassword) {
    return res.status(400).send({ message: "Missing required fields" });
  }
  if (newPassword !== confirmNewPassword) {
    return res.status(400).send({ message: "New passwords do not match" });
  }
  if (newPassword.length < 8) {
    return res.status(400).send({ message: "Password must be at least 8 characters" });
  }

  try {
    const user = await User.findById(userId).select("+password");
    if (!user) return res.status(404).send({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).send({ message: "Current password is incorrect" });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    await user.save();

    return res.status(200).send({ message: "Password changed successfully" });
  } catch (err) {
    console.error("Change password error:", err);
    return res.status(500).send({ message: "Internal server error" });
  }
};

const uploadAvatar = async (req, res) => {
  const { _id: userId } = req.user;

  if (!req.file) {
    return res.status(400).send({ message: "No file uploaded" });
  }

  try {
    const bucket = getBucket();
    const uploadStream = bucket.openUploadStream(
      `avatar-${userId}-${Date.now()}`,
      {
        contentType: req.file.mimetype,
        metadata: {
          owner: userId.toString(),
          originalName: req.file.originalname,
          kind: "avatar",
        },
      }
    );

    uploadStream.end(req.file.buffer);

    const fileId = await new Promise((resolve, reject) => {
      uploadStream.on("finish", () => resolve(uploadStream.id));
      uploadStream.on("error", reject);
    });

    const avatarUrl = `/api/uploads/${fileId.toString()}`;

    const previousUser = await User.findById(userId).lean();
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { avatar: avatarUrl },
      { new: true, runValidators: true }
    ).orFail();

    // Best-effort cleanup of previous GridFS avatar file.
    const previousAvatar = previousUser?.avatar || "";
    const gridFsPrefix = "/api/uploads/";
    if (previousAvatar.startsWith(gridFsPrefix)) {
      const previousId = previousAvatar.slice(gridFsPrefix.length);
      if (mongoose.Types.ObjectId.isValid(previousId)) {
        try {
          await bucket.delete(new mongoose.Types.ObjectId(previousId));
        } catch (cleanupErr) {
          console.warn("Avatar cleanup warning:", cleanupErr.message);
        }
      }
    }

    return res.status(200).send({
      avatar: updatedUser.avatar,
    });
  } catch (err) {
    console.error("Avatar upload error:", err);
    return res.status(500).send({ message: "Internal server error" });
  }
};

// GET /coaches — public (no auth): the site's "Coaching Staff" page and each
// team page's coaching-staff block. Explicit opt-in via showOnCoachesPage —
// role alone (coach/admin) isn't a safe filter, since some admin accounts
// are internal/dev access rather than actual public-facing staff. Email/
// phone are included deliberately — the site has always published coach
// contact info publicly (this replaces a hardcoded contact list with real,
// coach-editable data), so this isn't a new exposure.
const listCoaches = async (req, res) => {
  try {
    const coaches = await User.find({ showOnCoachesPage: true })
      .select("name email phone bio coachTitle avatar teamId")
      .populate({ path: "teamId", select: "name" });
    return res.json(coaches);
  } catch (err) {
    console.error("List coaches error:", err);
    return res.status(500).json({ message: "Failed to fetch coaches" });
  }
};

module.exports = {
  signup,
  signin,
  forgotPassword,
  resetPassword,
  getCurrentUser,
  updateUserProfile,
  changePassword,
  uploadAvatar,
  listCoaches,
};
