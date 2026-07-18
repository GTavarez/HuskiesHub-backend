const mongoose = require("mongoose");

// Time-series log — the shape that actually supports "progress over time"
// graphing, unlike RecruitingProfile's single-value snapshot fields (which
// this deliberately does NOT touch or sync with — two sources of truth by
// design: recruiting snapshot vs. training history).
const PERFORMANCE_METRIC_TYPES = [
  "strength",
  "mobility",
  "speed",
  "jump",
  "exitVelocity",
  "throwingVelocity",
  "batSpeed",
  "armCare",
  "weightRoom",
];

const performanceEntrySchema = new mongoose.Schema(
  {
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true },
    metricType: { type: String, enum: PERFORMANCE_METRIC_TYPES, required: true },
    value: { type: Number, required: true },
    unit: { type: String, required: true }, // mph, seconds, inches, lbs, etc.
    recordedAt: { type: Date, default: Date.now }, // settable to backdate a test
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    notes: { type: String, default: "" },
  },
  { timestamps: true }
);

performanceEntrySchema.index({ playerId: 1, metricType: 1, recordedAt: 1 });

module.exports = {
  PerformanceEntry:
    mongoose.models.PerformanceEntry ||
    mongoose.model("PerformanceEntry", performanceEntrySchema),
  PERFORMANCE_METRIC_TYPES,
};
