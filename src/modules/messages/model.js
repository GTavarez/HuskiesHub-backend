const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Team",
      required: true,
      index: true,
    },
    // Null = the whole-team chat room (original behavior). Set = this message
    // belongs to a coach-created group chat scoped to a subset of the team.
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
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
    // A photo-only message has no text; every other message still needs some.
    text: {
      type: String,
      required: function requiredUnlessPhoto() {
        return !this.imageId;
      },
      trim: true,
      maxlength: 1000,
      default: "",
    },
    // GridFS file id of an attached photo. Deliberately NOT a public URL:
    // photos are only served through GET /api/messages/photo/:messageId,
    // which re-checks that the viewer is actually in this chat.
    imageId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ✅ prevents OverwriteModelError with nodemon/hot reload
module.exports =
  mongoose.models.Message || mongoose.model("Message", messageSchema);
