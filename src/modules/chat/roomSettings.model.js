const mongoose = require("mongoose");

// Settings that belong to the room itself, not to one person. Today that is
// "announcements only": only coaches and admins may post.
const chatRoomSettingsSchema = new mongoose.Schema(
  {
    roomKey: { type: String, required: true, unique: true },
    announcementOnly: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.ChatRoomSettings || mongoose.model("ChatRoomSettings", chatRoomSettingsSchema);
