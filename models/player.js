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
    GPA: String,
    image: String,
    isCommitted: Boolean,
    committedCollege: String,
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
  },
  {
    timestamps: true,
  }
);

playerSchema.index({ teamId: 1, name: 1, jersey: 1 }, { unique: true });

module.exports =
  mongoose.models.Player || mongoose.model("Player", playerSchema);
