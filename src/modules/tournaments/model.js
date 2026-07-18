const mongoose = require("mongoose");

// Standalone informational record — deliberately does NOT auto-generate
// Event docs for tournament games; that wasn't asked for and would add a
// sync-maintenance burden this pass doesn't need.
const tournamentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    location: { type: String, default: "" },
    teamIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Team" }],
    status: {
      type: String,
      enum: ["upcoming", "in-progress", "completed"],
      default: "upcoming",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

tournamentSchema.index({ startDate: 1 });

module.exports =
  mongoose.models.Tournament || mongoose.model("Tournament", tournamentSchema);
