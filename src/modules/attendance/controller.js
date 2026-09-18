const mongoose = require("mongoose");
const Attendance = require("./model");
const Event = require("../events/model");
const Player = require("../players/model");

// Coaches are scoped to their own team's data; admins see everything. Throws
// a 403-flavored error object the caller can respond with directly.
async function assertCoachOwnsTeam(req, teamId) {
  if (req.user.role === "admin") return;
  if (!teamId || String(teamId) !== String(req.user.teamId)) {
    const err = new Error("You can only manage attendance for your own team.");
    err.status = 403;
    throw err;
  }
}

const recordAttendance = async (req, res) => {
  const { eventId, playerId, status } = req.body;

  if (!eventId || !playerId || !status) {
    return res.status(400).json({ message: "eventId, playerId, and status are required" });
  }
  if (!["present", "absent", "late", "excused"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(400).json({ message: "Invalid eventId" });
  }

  try {
    const event = await Event.findById(eventId);
    if (!event) return res.status(404).json({ message: "Event not found" });
    await assertCoachOwnsTeam(req, event.teamId);

    const record = await Attendance.findOneAndUpdate(
      { eventId, playerId },
      { status, recordedBy: req.user._id },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.status(201).json(record);
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ message: err.message });
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
    if (eventId) {
      const event = await Event.findById(eventId);
      if (!event) return res.status(404).json({ message: "Event not found" });
      await assertCoachOwnsTeam(req, event.teamId);
    } else {
      const player = await Player.findById(playerId);
      if (!player) return res.status(404).json({ message: "Player not found" });
      await assertCoachOwnsTeam(req, player.teamId);
    }

    const records = await Attendance.find(filter).sort({ createdAt: -1 });
    return res.json(records);
  } catch (err) {
    if (err.status === 403) return res.status(403).json({ message: err.message });
    console.error("List attendance error:", err);
    return res.status(500).json({ message: "Failed to fetch attendance" });
  }
};

module.exports = { recordAttendance, listAttendance };
