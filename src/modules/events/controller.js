const mongoose = require("mongoose");
const Event = require("./model");

const listEvents = async (req, res) => {
  const { teamId, from, to } = req.query;

  if (!teamId || !mongoose.Types.ObjectId.isValid(teamId)) {
    return res.status(400).json({ message: "Valid teamId is required" });
  }

  const filter = { teamId };
  if (from || to) {
    filter.startsAt = {};
    if (from) filter.startsAt.$gte = new Date(from);
    if (to) filter.startsAt.$lte = new Date(to);
  }

  try {
    const events = await Event.find(filter).sort({ startsAt: 1 });
    return res.json(events);
  } catch (err) {
    console.error("List events error:", err);
    return res.status(500).json({ message: "Failed to fetch events" });
  }
};

const getEvent = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid event id" });
  }

  try {
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    return res.json(event);
  } catch (err) {
    console.error("Get event error:", err);
    return res.status(500).json({ message: "Failed to fetch event" });
  }
};

const createEvent = async (req, res) => {
  const { type, teamId, title, startsAt, endsAt, location, googleEventId } = req.body;

  if (!type || !teamId || !title || !startsAt || !endsAt) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const event = await Event.create({
      type,
      teamId,
      title,
      startsAt,
      endsAt,
      location,
      googleEventId: googleEventId || null,
      createdBy: req.user._id,
    });
    return res.status(201).json(event);
  } catch (err) {
    console.error("Create event error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const updateEvent = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid event id" });
  }

  const { title, startsAt, endsAt, location } = req.body;

  try {
    const event = await Event.findByIdAndUpdate(
      id,
      { title, startsAt, endsAt, location },
      { new: true, runValidators: true }
    );
    if (!event) return res.status(404).json({ message: "Event not found" });
    return res.json(event);
  } catch (err) {
    console.error("Update event error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const deleteEvent = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid event id" });
  }

  try {
    const event = await Event.findByIdAndDelete(id);
    if (!event) return res.status(404).json({ message: "Event not found" });
    return res.status(204).send();
  } catch (err) {
    console.error("Delete event error:", err);
    return res.status(500).json({ message: "Failed to delete event" });
  }
};

const upsertRsvp = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid event id" });
  }
  if (!["yes", "no", "maybe"].includes(status)) {
    return res.status(400).json({ message: "Invalid RSVP status" });
  }

  try {
    const event = await Event.findById(id);
    if (!event) return res.status(404).json({ message: "Event not found" });

    const existing = event.rsvps.find(
      (rsvp) => rsvp.userId.toString() === req.user._id.toString()
    );

    if (existing) {
      existing.status = status;
      existing.respondedAt = new Date();
    } else {
      event.rsvps.push({ userId: req.user._id, status, respondedAt: new Date() });
    }

    await event.save();
    return res.json(event);
  } catch (err) {
    console.error("RSVP error:", err);
    return res.status(500).json({ message: "Failed to save RSVP" });
  }
};

module.exports = {
  listEvents,
  getEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  upsertRsvp,
};
