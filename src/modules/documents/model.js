const mongoose = require("mongoose");

const documentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    fileRef: { type: mongoose.Schema.Types.ObjectId, required: true }, // GridFS file id in the "documents" bucket
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    visibility: {
      type: String,
      enum: ["public", "team", "parent", "coach", "admin"],
      default: "team",
    },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", default: null },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.Document || mongoose.model("Document", documentSchema);
