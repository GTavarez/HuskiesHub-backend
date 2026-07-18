const mongoose = require("mongoose");
const { PERFORMANCE_METRIC_TYPES } = require("./model");

const performanceGoalSchema = new mongoose.Schema(
  {
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true },
    metricType: { type: String, enum: PERFORMANCE_METRIC_TYPES, required: true },
    targetValue: { type: Number, required: true },
    targetUnit: { type: String, required: true },
    targetDate: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    // Flips automatically when a new PerformanceEntry for this playerId+metricType
    // has value >= targetValue (see controller.js). For "lower is better" metrics
    // (sprint times, pop time), that automatic rule won't fit — mark achieved
    // manually via PATCH instead of building a per-metric direction flag.
    achieved: { type: Boolean, default: false },
    achievedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

performanceGoalSchema.index({ playerId: 1, metricType: 1, achieved: 1 });

module.exports =
  mongoose.models.PerformanceGoal ||
  mongoose.model("PerformanceGoal", performanceGoalSchema);
