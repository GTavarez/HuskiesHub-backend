const mongoose = require("mongoose");
const Announcement = require("./model");

const listAnnouncements = async (req, res) => {
  const { teamId } = req.query;

  const filter = {};
  if (teamId) {
    if (!mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ message: "Invalid teamId" });
    }
    // org-wide (teamId: null) announcements are always included alongside team-specific ones
    filter.$or = [{ teamId }, { teamId: null }];
  }

  try {
    const announcements = await Announcement.find(filter).sort({ createdAt: -1 });
    return res.json(announcements);
  } catch (err) {
    console.error("List announcements error:", err);
    return res.status(500).json({ message: "Failed to fetch announcements" });
  }
};

const createAnnouncement = async (req, res) => {
  const { teamId, title, body, audience } = req.body;

  if (!title || !body) {
    return res.status(400).json({ message: "title and body are required" });
  }

  try {
    const announcement = await Announcement.create({
      teamId: teamId || null,
      title,
      body,
      audience: audience || [],
      authorId: req.user._id,
    });
    return res.status(201).json(announcement);
  } catch (err) {
    console.error("Create announcement error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const deleteAnnouncement = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid announcement id" });
  }

  try {
    const announcement = await Announcement.findByIdAndDelete(id);
    if (!announcement) return res.status(404).json({ message: "Announcement not found" });
    return res.status(204).send();
  } catch (err) {
    console.error("Delete announcement error:", err);
    return res.status(500).json({ message: "Failed to delete announcement" });
  }
};

module.exports = { listAnnouncements, createAnnouncement, deleteAnnouncement };
