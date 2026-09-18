const mongoose = require("mongoose");

const DAYS = ["Mon", "Tue", "Wed", "Thu"];
const STATUSES = ["open", "requested", "confirmed"];
const PACKAGE_TYPES = ["fall_lesson_package", "academy_plus_1", "academy_plus_2"];
const PAYMENT_STATUSES = ["not_invoiced", "invoiced", "paid"];

// Snapshot of the family fields at the moment of an event — the only place a
// declined request's info survives, since decline wipes the live document's
// top-level fields to reopen the slot.
const historyEntrySchema = new mongoose.Schema(
  {
    event: { type: String, enum: ["requested", "confirmed", "declined"], required: true },
    at: { type: Date, default: Date.now },
    athleteName: String,
    parentName: String,
    parentEmail: String,
    parentPhone: String,
    packageType: { type: String, enum: PACKAGE_TYPES },
  },
  { _id: false }
);

// One document per recurring WEEKLY slot (not a calendar date) — a confirmed
// booking claims it for the whole term, so there's no per-week occurrence
// record to model. Separate from the `lesson-slots` module, which is
// single-date instant-checkout, a different feature entirely.
const lessonRequestSlotSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: String, enum: DAYS, required: true },
    location: {
      type: String,
      required: true,
      default: "Advanced Player Academy Waldwick, NJ",
      trim: true,
    },
    startTime: { type: String, required: true }, // "16:00" 24h — sort key only
    endTime: { type: String, required: true }, // "16:30" 24h
    timeLabel: { type: String, required: true, trim: true }, // "4:00-4:30pm" display

    status: { type: String, enum: STATUSES, default: "open" },

    athleteName: { type: String, default: "" },
    parentName: { type: String, default: "" },
    parentEmail: { type: String, default: "" },
    parentPhone: { type: String, default: "" },
    // Hard enum — no free-text/standalone-single-lesson option, ever.
    packageType: { type: String, enum: PACKAGE_TYPES, default: null },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: "not_invoiced" },

    requestedAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Mirrors User.resetPasswordTokenHash — raw token is emailed, only its
    // hash is ever persisted. Covers both the confirm and decline actions
    // for one request cycle.
    actionTokenHash: { type: String, default: null, select: false },
    actionTokenExpires: { type: Date, default: null },

    history: [historyEntrySchema],
  },
  { timestamps: true }
);

// Prevents accidentally defining the same recurring weekly slot twice.
lessonRequestSlotSchema.index(
  { dayOfWeek: 1, location: 1, startTime: 1, endTime: 1 },
  { unique: true }
);
lessonRequestSlotSchema.index({ status: 1, dayOfWeek: 1, startTime: 1 });

module.exports =
  mongoose.models.LessonRequestSlot ||
  mongoose.model("LessonRequestSlot", lessonRequestSlotSchema);

module.exports.DAYS = DAYS;
module.exports.STATUSES = STATUSES;
module.exports.PACKAGE_TYPES = PACKAGE_TYPES;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
