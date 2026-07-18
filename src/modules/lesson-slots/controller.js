const mongoose = require("mongoose");
const LessonSlot = require("./model");

function canManageSlot(user, instructorUserId) {
  if (user.role === "admin") return true;
  return user.role === "coach" && user._id.toString() === instructorUserId.toString();
}

const createSlot = async (req, res) => {
  const { instructorUserId, startsAt, endsAt, capacity, relatedProductId } = req.body;

  if (!instructorUserId || !startsAt || !endsAt || !capacity) {
    return res.status(400).json({
      message: "instructorUserId, startsAt, endsAt, and capacity are required",
    });
  }
  if (!canManageSlot(req.user, instructorUserId)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const slot = await LessonSlot.create({
      instructorUserId,
      startsAt,
      endsAt,
      capacity,
      relatedProductId: relatedProductId || null,
    });
    return res.status(201).json(slot);
  } catch (err) {
    console.error("Create lesson slot error:", err);
    return res.status(400).json({ message: err.message });
  }
};

// Open to any authenticated role — parents need to browse available slots to book.
const listSlots = async (req, res) => {
  const { instructorUserId, availableOnly } = req.query;

  const filter = {};
  if (instructorUserId) filter.instructorUserId = instructorUserId;
  if (availableOnly === "true") {
    filter.$expr = { $lt: ["$bookedCount", "$capacity"] };
    filter.startsAt = { $gte: new Date() };
  }

  try {
    const slots = await LessonSlot.find(filter).sort({ startsAt: 1 });
    return res.json(slots);
  } catch (err) {
    console.error("List lesson slots error:", err);
    return res.status(500).json({ message: "Failed to fetch lesson slots" });
  }
};

const updateSlot = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid slot id" });
  }

  try {
    const slot = await LessonSlot.findById(id);
    if (!slot) return res.status(404).json({ message: "Lesson slot not found" });
    if (!canManageSlot(req.user, slot.instructorUserId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const { startsAt, endsAt, capacity } = req.body;
    const updated = await LessonSlot.findByIdAndUpdate(
      id,
      { startsAt, endsAt, capacity },
      { new: true, runValidators: true }
    );
    return res.json(updated);
  } catch (err) {
    console.error("Update lesson slot error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const deleteSlot = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid slot id" });
  }

  try {
    const slot = await LessonSlot.findById(id);
    if (!slot) return res.status(404).json({ message: "Lesson slot not found" });
    if (!canManageSlot(req.user, slot.instructorUserId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    await LessonSlot.findByIdAndDelete(id);
    return res.status(204).send();
  } catch (err) {
    console.error("Delete lesson slot error:", err);
    return res.status(500).json({ message: "Failed to delete lesson slot" });
  }
};

module.exports = { createSlot, listSlots, updateSlot, deleteSlot };
