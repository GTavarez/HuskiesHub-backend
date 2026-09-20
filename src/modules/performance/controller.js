const mongoose = require("mongoose");
const { PerformanceEntry } = require("./model");
const PerformanceGoal = require("./goalModel");
const { canAccessPlayerScoped } = require("../../common/utils/ownership");

const createEntry = async (req, res) => {
  const { playerId, metricType, value, unit, recordedAt, notes } = req.body;

  if (!playerId || !metricType || value === undefined || !unit) {
    return res.status(400).json({ message: "playerId, metricType, value, and unit are required" });
  }
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ message: "Invalid playerId" });
  }
  if (!(await canAccessPlayerScoped(req.user, playerId))) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const entry = await PerformanceEntry.create({
      playerId,
      metricType,
      value,
      unit,
      recordedAt: recordedAt || undefined,
      notes,
      recordedBy: req.user._id,
    });

    // Auto-achieve any open goal this entry meets/exceeds — see goalModel.js
    // for why this is a simple ">=" rule rather than a per-metric direction flag.
    await PerformanceGoal.updateMany(
      { playerId, metricType, achieved: false, targetValue: { $lte: value } },
      { achieved: true, achievedAt: new Date() }
    );

    return res.status(201).json(entry);
  } catch (err) {
    console.error("Create performance entry error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const getEntries = async (req, res) => {
  const { playerId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ message: "Invalid playerId" });
  }
  if (!(await canAccessPlayerScoped(req.user, playerId))) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const entries = await PerformanceEntry.find({ playerId }).sort({ recordedAt: 1 });
    return res.json(entries);
  } catch (err) {
    console.error("Get performance entries error:", err);
    return res.status(500).json({ message: "Failed to fetch performance entries" });
  }
};

const createGoal = async (req, res) => {
  const { playerId, metricType, targetValue, targetUnit, targetDate } = req.body;

  if (!playerId || !metricType || targetValue === undefined || !targetUnit) {
    return res.status(400).json({
      message: "playerId, metricType, targetValue, and targetUnit are required",
    });
  }
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ message: "Invalid playerId" });
  }
  if (!(await canAccessPlayerScoped(req.user, playerId))) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const goal = await PerformanceGoal.create({
      playerId,
      metricType,
      targetValue,
      targetUnit,
      targetDate: targetDate || null,
      createdBy: req.user._id,
    });
    return res.status(201).json(goal);
  } catch (err) {
    console.error("Create performance goal error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const getGoals = async (req, res) => {
  const { playerId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ message: "Invalid playerId" });
  }
  if (!(await canAccessPlayerScoped(req.user, playerId))) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const goals = await PerformanceGoal.find({ playerId }).sort({ createdAt: -1 });
    return res.json(goals);
  } catch (err) {
    console.error("Get performance goals error:", err);
    return res.status(500).json({ message: "Failed to fetch performance goals" });
  }
};

// Manual override for "lower is better" metrics (sprint times, pop time) where
// the automatic value>=targetValue rule in createEntry doesn't apply.
const updateGoal = async (req, res) => {
  const { goalId } = req.params;
  const { achieved } = req.body;

  if (!mongoose.Types.ObjectId.isValid(goalId)) {
    return res.status(400).json({ message: "Invalid goal id" });
  }

  try {
    const existing = await PerformanceGoal.findById(goalId);
    if (!existing) return res.status(404).json({ message: "Goal not found" });
    if (!(await canAccessPlayerScoped(req.user, existing.playerId))) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const goal = await PerformanceGoal.findByIdAndUpdate(
      goalId,
      { achieved: Boolean(achieved), achievedAt: achieved ? new Date() : null },
      { new: true }
    );
    return res.json(goal);
  } catch (err) {
    console.error("Update performance goal error:", err);
    return res.status(400).json({ message: err.message });
  }
};

module.exports = { createEntry, getEntries, createGoal, getGoals, updateGoal };
