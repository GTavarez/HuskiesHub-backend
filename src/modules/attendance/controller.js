const mongoose = require("mongoose");
const Attendance = require("./model");

const recordAttendance = async (req, res) => {
  const { eventId, playerId, status } = req.body;

  if (!eventId || !playerId || !status) {
    return res.status(400).json({ message: "eventId, playerId, and status are required" });
  }
  if (!["present", "absent", "late", "excused"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  try {
    const record = await Attendance.findOneAndUpdate(
      { eventId, playerId },
      { status, recordedBy: req.user._id },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.status(201).json(record);
  } catch (err) {
    console.error("Record attendance error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const listAttendance = async (req, res) => {
  const { eventId, playerId } = req.query;

  if (!eventId && !playerId) {
    return res.status(400).json({ message: "eventId or playerId is required" });
  }

  const filter = {};
  if (eventId) {
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({ message: "Invalid eventId" });
    }
    filter.eventId = eventId;
  }
  if (playerId) {
    if (!mongoose.Types.ObjectId.isValid(playerId)) {
      return res.status(400).json({ message: "Invalid playerId" });
    }
    filter.playerId = playerId;
  }

  try {
    const records = await Attendance.find(filter).sort({ createdAt: -1 });
    return res.json(records);
  } catch (err) {
    console.error("List attendance error:", err);
    return res.status(500).json({ message: "Failed to fetch attendance" });
  }
};

module.exports = { recordAttendance, listAttendance };
