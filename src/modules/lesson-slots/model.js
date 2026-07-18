const mongoose = require("mongoose");

const lessonSlotSchema = new mongoose.Schema(
  {
    instructorUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    capacity: { type: Number, required: true, min: 1 },
    bookedCount: { type: Number, default: 0, min: 0 },
    // Only meaningful when the referenced Product has type:"lesson".
    relatedProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
  },
  { timestamps: true }
);

lessonSlotSchema.index({ instructorUserId: 1, startsAt: 1 });
lessonSlotSchema.index({ startsAt: 1 });

module.exports =
  mongoose.models.LessonSlot || mongoose.model("LessonSlot", lessonSlotSchema);
