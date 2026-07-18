const mongoose = require("mongoose");

// Net-new recruiting fields only — gradYear/position/highSchool/GPA/
// isCommitted/committedCollege/name/jersey/image stay on Player as the
// single source of truth (see modules/players/model.js). This is distinct
// from PlayerNote's type:"recruiting" (private, coach-authored evaluation
// notes) — this model is the player/family-authored, coach-searchable profile.
const recruitingProfileSchema = new mongoose.Schema(
  {
    playerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Player",
      required: true,
      unique: true,
    },
    satScore: { type: Number, default: null },
    actScore: { type: Number, default: null },
    exitVelocity: { type: Number, default: null }, // mph
    popTime: { type: Number, default: null }, // seconds, catchers
    pitchVelocity: { type: Number, default: null }, // mph
    sixtyYardDash: { type: Number, default: null }, // seconds
    throwingVelocity: { type: Number, default: null }, // mph
    // External links only (YouTube/Hudl/Vimeo) — validated against an
    // allowlist in the controller; we never host video files ourselves.
    highlightVideoUrls: { type: [String], default: [] },
    // Opt-in: only visible-true profiles are ever returned to approved
    // college_coach callers (admin/coach/parent/player always see their own).
    visible: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

recruitingProfileSchema.index({ visible: 1 });

module.exports =
  mongoose.models.RecruitingProfile ||
  mongoose.model("RecruitingProfile", recruitingProfileSchema);
