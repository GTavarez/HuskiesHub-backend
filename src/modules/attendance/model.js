const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event", required: true },
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true },
    status: {
      type: String,
      enum: ["present", "absent", "late", "excused"],
      required: true,
    },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

attendanceSchema.index({ eventId: 1, playerId: 1 }, { unique: true });

module.exports =
  mongoose.models.Attendance || mongoose.model("Attendance", attendanceSchema);
