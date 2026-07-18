const mongoose = require("mongoose");
const PlayerNote = require("./model");

const listNotes = async (req, res) => {
  const { playerId } = req.query;

  if (!playerId || !mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ message: "Valid playerId is required" });
  }

  const filter = { playerId };
  const canSeePrivate = ["admin", "coach"].includes(req.user.role);
  if (!canSeePrivate) {
    filter.visibleToParent = true;
  }

  try {
    const notes = await PlayerNote.find(filter).sort({ createdAt: -1 });
    return res.json(notes);
  } catch (err) {
    console.error("List player notes error:", err);
    return res.status(500).json({ message: "Failed to fetch notes" });
  }
};

const createNoteRecord = ({ playerId, type, body, visibleToParent, authorId }) =>
  PlayerNote.create({
    playerId,
    type,
    body,
    visibleToParent: Boolean(visibleToParent),
    authorId,
  });

const createNote = async (req, res) => {
  const { playerId, type, body, visibleToParent } = req.body;

  if (!playerId || !type || !body) {
    return res.status(400).json({ message: "playerId, type, and body are required" });
  }

  try {
    const note = await createNoteRecord({
      playerId,
      type,
      body,
      visibleToParent,
      authorId: req.user._id,
    });
    return res.status(201).json(note);
  } catch (err) {
    console.error("Create player note error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const deleteNote = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid note id" });
  }

  try {
    const note = await PlayerNote.findByIdAndDelete(id);
    if (!note) return res.status(404).json({ message: "Note not found" });
    return res.status(204).send();
  } catch (err) {
    console.error("Delete player note error:", err);
    return res.status(500).json({ message: "Failed to delete note" });
  }
};

module.exports = { listNotes, createNote, deleteNote, createNoteRecord };
