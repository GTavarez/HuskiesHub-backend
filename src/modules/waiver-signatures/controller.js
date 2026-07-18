const mongoose = require("mongoose");
const WaiverSignature = require("./model");
const Waiver = require("../waivers/model");
const { canAccessPlayer } = require("../../common/utils/ownership");

const signWaiver = async (req, res) => {
  const { playerId, waiverId, signedName, agreedToTerms } = req.body;

  if (!playerId || !waiverId || !signedName || !agreedToTerms) {
    return res.status(400).json({
      message: "playerId, waiverId, signedName, and agreedToTerms are required",
    });
  }
  if (!canAccessPlayer(req.user, playerId)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const waiver = await Waiver.findById(waiverId);
    if (!waiver) return res.status(404).json({ message: "Waiver not found" });

    const signature = await WaiverSignature.create({
      waiverId,
      playerId,
      signedByUserId: req.user._id,
      signedName,
      agreedToTerms: Boolean(agreedToTerms),
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] || "",
      snapshotBodyText: waiver.bodyText,
      snapshotVersion: waiver.version,
    });

    return res.status(201).json(signature);
  } catch (err) {
    console.error("Sign waiver error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const listSignatures = async (req, res) => {
  const { playerId, waiverId } = req.query;

  const filter = {};
  if (playerId) {
    if (!mongoose.Types.ObjectId.isValid(playerId)) {
      return res.status(400).json({ message: "Invalid playerId" });
    }
    filter.playerId = playerId;
  }
  if (waiverId) {
    if (!mongoose.Types.ObjectId.isValid(waiverId)) {
      return res.status(400).json({ message: "Invalid waiverId" });
    }
    filter.waiverId = waiverId;
  }

  try {
    const signatures = await WaiverSignature.find(filter).sort({ signedAt: -1 });
    return res.json(signatures);
  } catch (err) {
    console.error("List waiver signatures error:", err);
    return res.status(500).json({ message: "Failed to fetch signatures" });
  }
};

module.exports = { signWaiver, listSignatures };
