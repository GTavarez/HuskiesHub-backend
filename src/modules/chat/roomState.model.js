const mongoose = require("mongoose");

// Per-person, per-chat-room state: when they last read it (drives unread
// counts and "seen by") and whether they have muted it. roomKey is
// "team:<id>", "conv:<id>" or "event:<id>".
const chatRoomStateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    roomKey: { type: String, required: true },
    lastReadAt: { type: Date, default: null },
    mutedUntil: { type: Date, default: null },
  },
  { timestamps: true }
);

chatRoomStateSchema.index({ userId: 1, roomKey: 1 }, { unique: true });
chatRoomStateSchema.index({ roomKey: 1 });

module.exports =
  mongoose.models.ChatRoomState || mongoose.model("ChatRoomState", chatRoomStateSchema);
