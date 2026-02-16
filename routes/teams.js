const router = require("express").Router();
const Team = require("../models/Team");
const mongoose = require("mongoose");
router.get("/", async (req, res) => {
  try {
    const teams = await Team.find();
    res.json(teams);
  } catch (err) {
    console.error("Get teams error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
// GET team by id
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid team id" });
  }

  const team = await Team.findById(id);
  if (!team) return res.status(404).json({ message: "Team not found" });

  res.json(team);
});

module.exports = router;
