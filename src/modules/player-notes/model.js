const mongoose = require("mongoose");

const playerNoteSchema = new mongoose.Schema(
  {
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["evaluation", "injury", "recruiting", "general"],
      required: true,
    },
    body: { type: String, required: true },
    visibleToParent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

playerNoteSchema.index({ playerId: 1, createdAt: -1 });

module.exports =
  mongoose.models.PlayerNote || mongoose.model("PlayerNote", playerNoteSchema);
