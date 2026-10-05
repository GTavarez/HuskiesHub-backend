const mongoose = require("mongoose");

// A member flagging a message for an admin to review. The message text is
// snapshotted so the report still makes sense if the sender later edits or
// deletes it.
const chatReportSchema = new mongoose.Schema(
  {
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message", required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    roomKey: { type: String, required: true },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    reporterName: { type: String, required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    senderName: { type: String, required: true },
    textSnapshot: { type: String, default: "" },
    reason: { type: String, default: "", trim: true, maxlength: 500 },
    status: { type: String, enum: ["open", "dismissed", "actioned"], default: "open" },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

chatReportSchema.index({ messageId: 1, reporterId: 1 }, { unique: true });
chatReportSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.models.ChatReport || mongoose.model("ChatReport", chatReportSchema);
