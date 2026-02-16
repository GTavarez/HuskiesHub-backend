const Team = require("../models/Team");

/**
 * POST /api/teams
 * Create a new team
 */
const createTeam = async (req, res) => {
  try {
    const { name, ageGroup } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Team name is required" });
    }

    const team = await Team.create({ name, ageGroup });
    res.status(201).json(team);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Team already exists" });
    }

    console.error("❌ Create team error:", err);
    res.status(500).json({ message: "Failed to create team" });
  }
};

/**
 * GET /api/teams
 * List all teams
 */
const getTeams = async (req, res) => {
  try {
    const teams = await Team.find().sort({ createdAt: 1 });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ message: "Failed to load teams" });
  }
};

module.exports = {
  createTeam,
  getTeams,
};
