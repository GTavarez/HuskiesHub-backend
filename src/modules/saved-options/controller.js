const mongoose = require("mongoose");
const SavedOption = require("./model");

const KINDS = ["opponent", "location"];

// Called from the event handlers; never throws, since remembering a
// suggestion must not be able to fail saving the event itself.
async function rememberOption({ kind, teamId, name }) {
  try {
    const clean = typeof name === "string" ? name.trim().replace(/\s+/g, " ") : "";
    if (!clean || !KINDS.includes(kind)) return;
    const scopedTeamId = kind === "opponent" ? teamId || null : null;
    await SavedOption.findOneAndUpdate(
      { kind, teamId: scopedTeamId, nameKey: clean.toLowerCase() },
      {
        $setOnInsert: { name: clean },
        $inc: { useCount: 1 },
        $set: { lastUsedAt: new Date() },
      },
      { upsert: true }
    );
  } catch (err) {
    console.warn("Saved option not remembered:", err.message);
  }
}

const listOptions = async (req, res) => {
  const { kind, teamId } = req.query;
  if (!KINDS.includes(kind)) {
    return res.status(400).json({ message: "kind must be 'opponent' or 'location'" });
  }

  const filter = { kind };
  if (kind === "opponent") {
    if (!teamId || !mongoose.Types.ObjectId.isValid(teamId)) {
      return res.status(400).json({ message: "A valid teamId is required for opponents" });
    }
    if (req.user.role === "coach" && String(teamId) !== String(req.user.teamId)) {
      return res.status(403).json({ message: "You can only see your own team's opponents" });
    }
    filter.teamId = teamId;
  } else {
    filter.teamId = null;
  }

  try {
    const options = await SavedOption.find(filter).sort({ useCount: -1, name: 1 });
    return res.json(options.map((o) => ({ _id: o._id, name: o.name, useCount: o.useCount })));
  } catch (err) {
    console.error("List saved options error:", err);
    return res.status(500).json({ message: "Failed to fetch suggestions" });
  }
};

const deleteOption = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  try {
    const removed = await SavedOption.findByIdAndDelete(id);
    if (!removed) return res.status(404).json({ message: "Not found" });
    return res.status(204).send();
  } catch (err) {
    console.error("Delete saved option error:", err);
    return res.status(500).json({ message: "Failed to delete" });
  }
};

module.exports = { rememberOption, listOptions, deleteOption };
