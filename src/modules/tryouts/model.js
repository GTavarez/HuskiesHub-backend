const mongoose = require("mongoose");
const { AGE_GROUPS, STATUSES } = require("./validate");

// One document per tryout registration from the public Tryouts page. A player
// record needs a team, so a tryout stays here until the coaches move her onto
// one; that is when the Player is created and the two are linked.
const tryoutSchema = new mongoose.Schema(
  {
    playerName: { type: String, required: true, trim: true },
    ageGroup: { type: String, enum: AGE_GROUPS, required: true },
    birthDate: { type: Date, default: null },
    position: { type: String, required: true, trim: true },
    currentTeam: { type: String, default: "", trim: true },
    previousClubExperience: { type: String, default: "" },

    parentName: { type: String, required: true, trim: true },
    parentEmail: { type: String, required: true, trim: true, lowercase: true },
    parentPhone: { type: String, required: true, trim: true },

    status: { type: String, enum: STATUSES, default: "new" },
    // Set when she is moved onto a team.
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null },
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", default: null },
  },
  { timestamps: true }
);

tryoutSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.Tryout || mongoose.model("Tryout", tryoutSchema);
