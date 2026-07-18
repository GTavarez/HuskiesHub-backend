const mongoose = require("mongoose");

const waiverSignatureSchema = new mongoose.Schema(
  {
    waiverId: { type: mongoose.Schema.Types.ObjectId, ref: "Waiver", required: true },
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true },
    signedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    signedName: { type: String, required: true },
    agreedToTerms: { type: Boolean, required: true },
    signedAt: { type: Date, default: Date.now },
    ipAddress: { type: String, required: true },
    userAgent: { type: String, default: "" },
    // Snapshot the exact text/version agreed to, so a later edit to Waiver.bodyText
    // can't retroactively change what a past signature legally represents.
    snapshotBodyText: { type: String, required: true },
    snapshotVersion: { type: Number, required: true },
  },
  { timestamps: true }
);

waiverSignatureSchema.index({ playerId: 1, waiverId: 1 });

module.exports =
  mongoose.models.WaiverSignature ||
  mongoose.model("WaiverSignature", waiverSignatureSchema);
