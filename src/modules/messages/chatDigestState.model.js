const mongoose = require("mongoose");

// One row per (user, team) — tracks when that user was last emailed about
// unread team-chat activity, so the digest cron only reports messages that
// arrived since their last notification instead of the whole history.
const chatDigestStateSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
  lastNotifiedAt: { type: Date, required: true },
});

chatDigestStateSchema.index({ userId: 1, teamId: 1 }, { unique: true });

module.exports =
  mongoose.models.ChatDigestState ||
  mongoose.model("ChatDigestState", chatDigestStateSchema);
