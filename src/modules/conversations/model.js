const mongoose = require("mongoose");

// A coach-created group chat scoped to a subset of one team's roster —
// sits alongside the original whole-team chat rather than replacing it.
const conversationSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // Always includes createdBy — a creator who later leaves their own group
    // still owns it, but can't read it, matching how memberIds gates access.
    memberIds: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
      required: true,
      validate: {
        validator: (arr) => Array.isArray(arr) && arr.length > 0,
        message: "A conversation needs at least one member.",
      },
    },
  },
  { timestamps: true }
);

conversationSchema.index({ teamId: 1, memberIds: 1 });

module.exports =
  mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema);
