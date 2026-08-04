const mongoose = require("mongoose");

const highlightSchema = new mongoose.Schema({
  imageUrl: String,
  videoUrl: String,
  createdAt: { type: Date, default: Date.now },
});

const funFactSchema = new mongoose.Schema({
  text: String,
  createdAt: { type: Date, default: Date.now },
});

const playerSchema = new mongoose.Schema(
  {
    name: String,
    jersey: Number,
    position: String,
    gradYear: Number,
    highSchool: String,
    state: { type: String, default: "" },
    GPA: String,
    image: String,
    isCommitted: Boolean,
    committedCollege: String,
    battingThrowing: { type: String, default: "" }, // e.g. "R/R", "L/R"
    contactEmail: { type: String, default: "" },
    funFacts: [funFactSchema],
    highlights: [highlightSchema],

    // 🔑 CHAT + PERMISSIONS
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true, // important for chat
    },

    role: {
      type: String,
      enum: ["player", "coach", "admin"],
      default: "player",
    },

    // "Delete" from a team's roster is a soft-remove, not a document delete —
    // registrations, chat history, and PDFs already reference this playerId,
    // so the record stays in the database and can be restored.
    removedFromRoster: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

playerSchema.index({ teamId: 1, name: 1, jersey: 1 }, { unique: true });

module.exports =
  mongoose.models.Player || mongoose.model("Player", playerSchema);
