const mongoose = require("mongoose");

const reactionSchema = new mongoose.Schema(
  {
    emoji: { type: String, required: true },
    userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    // Null = the whole-team chat room (original behavior). Set = this message
    // belongs to a group chat or direct message.
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      default: null,
      index: true,
    },
    // Set = this message belongs to one game or practice's own chat.
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      default: null,
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderName: {
      type: String,
      required: true,
    },
    // Stamped at send time so a message list needs no per-message user lookup.
    senderRole: { type: String, default: "" },
    senderAvatar: { type: String, default: "" },
    // A photo-only message has no text; every other message still needs some.
    text: {
      type: String,
      required: function requiredUnlessPhoto() {
        return !this.imageId && !this.deletedAt;
      },
      trim: true,
      maxlength: 2000,
      default: "",
    },
    // GridFS file id of an attached photo. Deliberately NOT a public URL:
    // photos are only served through GET /api/messages/photo/:messageId,
    // which re-checks that the viewer is actually in this chat.
    imageId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    // A snapshot of the message being replied to, so the quote still reads
    // correctly if the original is later edited or deleted.
    replyTo: {
      messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
      senderName: { type: String },
      text: { type: String },
      hasImage: { type: Boolean },
    },
    reactions: { type: [reactionSchema], default: [] },
    // People @mentioned; they are notified even if they muted the chat.
    mentions: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Coach/admin only: also sent by email right away, ignoring mute.
    urgent: { type: Boolean, default: false },
    // Parent only: alerts the coaches and admins, but not the other families.
    flagged: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    // Deleting keeps the row (so replies and moderation records still make
    // sense) but clears its content.
    deletedAt: { type: Date, default: null },
    deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    pinnedAt: { type: Date, default: null },
    pinnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ teamId: 1, conversationId: 1, eventId: 1, createdAt: -1 });

// ✅ prevents OverwriteModelError with nodemon/hot reload
module.exports =
  mongoose.models.Message || mongoose.model("Message", messageSchema);
