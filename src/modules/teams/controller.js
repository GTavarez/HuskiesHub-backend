const mongoose = require("mongoose");
const Team = require("./model");

/**
 * POST /api/teams
 * Create a new team
 */
const createTeam = async (req, res) => {
  try {
    const {
      name,
      ageGroup,
      registrationFeeCents,
      depositAmountCents,
      autopayAmountCents,
      autopayDayOfMonth,
    } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Team name is required" });
    }

    const team = await Team.create({
      name,
      ageGroup,
      registrationFeeCents,
      depositAmountCents,
      autopayAmountCents,
      autopayDayOfMonth,
    });
    return res.status(201).json(team);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Team already exists" });
    }

    console.error("❌ Create team error:", err);
    return res.status(500).json({ message: "Failed to create team" });
  }
};

const TEAM_EDITABLE_FIELDS = [
  "name",
  "ageGroup",
  "registrationFeeCents",
  "depositAmountCents",
  "autopayAmountCents",
  "autopayDayOfMonth",
];

/**
 * PATCH /api/teams/:id (admin only)
 */
const updateTeam = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid team id" });
  }

  const updates = {};
  TEAM_EDITABLE_FIELDS.forEach((field) => {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  });

  try {
    const team = await Team.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    if (!team) return res.status(404).json({ message: "Team not found" });
    return res.json(team);
  } catch (err) {
    console.error("Update team error:", err);
    return res.status(400).json({ message: err.message });
  }
};

/**
 * GET /api/teams
 * List all teams
 */
const getTeams = async (req, res) => {
  try {
    const teams = await Team.find().sort({ createdAt: 1 });
    return res.json(teams);
  } catch (err) {
    console.error("Get teams error:", err);
    return res.status(500).json({ message: "Failed to load teams" });
  }
};

/**
 * GET /api/teams/:id
 */
const getTeamById = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid team id" });
  }

  try {
    const team = await Team.findById(id);
    if (!team) return res.status(404).json({ message: "Team not found" });
    return res.json(team);
  } catch (err) {
    console.error("Get team by id error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

module.exports = {
  createTeam,
  getTeams,
  getTeamById,
  updateTeam,
};
