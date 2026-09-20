const mongoose = require("mongoose");

// Remembered opponents (per team) and locations (club-wide, since teams share
// fields), offered as suggestions on every event form. Entries are created
// automatically whenever an event is saved with one of these values, so the
// lists grow on their own; an admin can delete a mistyped one.
const savedOptionSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["opponent", "location"], required: true },
    // null for locations (shared across teams); the team for opponents.
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null },
    name: { type: String, required: true, trim: true },
    // Lowercased, for de-duplicating "Ringwood, NJ" vs "ringwood, nj".
    nameKey: { type: String, required: true },
    useCount: { type: Number, default: 1 },
    lastUsedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

savedOptionSchema.index({ kind: 1, teamId: 1, nameKey: 1 }, { unique: true });

module.exports =
  mongoose.models.SavedOption || mongoose.model("SavedOption", savedOptionSchema);
