const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema(
  {
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null }, // null = org-wide
    title: { type: String, required: true },
    body: { type: String, required: true },
    authorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    audience: {
      type: [String],
      enum: ["parent", "player", "coach", "admin", "fan"],
      default: [],
    },
  },
  { timestamps: true }
);

announcementSchema.index({ teamId: 1, createdAt: -1 });

module.exports =
  mongoose.models.Announcement || mongoose.model("Announcement", announcementSchema);
