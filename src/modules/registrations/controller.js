const mongoose = require("mongoose");
const Registration = require("./model");
const Player = require("../players/model");
const Team = require("../teams/model");
const { canAccessPlayer } = require("../../common/utils/ownership");

const listRegistrations = async (req, res) => {
  const { playerId, teamId, season } = req.query;

  if (playerId && !canAccessPlayer(req.user, playerId)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  if (!playerId && req.user.role === "parent") {
    // Parents must scope to a specific (owned) player — never all registrations.
    return res.status(400).json({ message: "playerId is required" });
  }

  const filter = {};
  if (playerId) filter.playerId = playerId;
  if (teamId) filter.teamId = teamId;
  if (season) filter.season = season;

  try {
    const registrations = await Registration.find(filter).sort({ createdAt: -1 });
    return res.json(registrations);
  } catch (err) {
    console.error("List registrations error:", err);
    return res.status(500).json({ message: "Failed to fetch registrations" });
  }
};

const getRegistration = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid registration id" });
  }

  try {
    const registration = await Registration.findById(id);
    if (!registration) return res.status(404).json({ message: "Registration not found" });
    if (!canAccessPlayer(req.user, registration.playerId)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return res.json(registration);
  } catch (err) {
    console.error("Get registration error:", err);
    return res.status(500).json({ message: "Failed to fetch registration" });
  }
};

// teamId is never accepted from the client — it's derived from the player's
// own roster team, and registrationFeeCents/depositAmountCents/autopay* are
// resolved from that team's configured pricing for anyone but admin, so a
// parent can never set their own registration fee.
const createRegistration = async (req, res) => {
  const { playerId, season, registrationFeeCents, depositAmountCents } = req.body;

  if (!playerId || !season) {
    return res.status(400).json({ message: "playerId and season are required" });
  }
  if (!canAccessPlayer(req.user, playerId)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) return res.status(404).json({ message: "Player not found" });

    const team = await Team.findById(player.teamId);
    if (!team) return res.status(404).json({ message: "Player's team not found" });

    const isAdmin = req.user.role === "admin";
    const resolvedFeeCents =
      isAdmin && registrationFeeCents !== undefined
        ? registrationFeeCents
        : team.registrationFeeCents;
    const resolvedDepositCents =
      isAdmin && depositAmountCents !== undefined
        ? depositAmountCents
        : team.depositAmountCents;

    const registration = await Registration.create({
      playerId,
      teamId: player.teamId,
      season,
      registrationFeeCents: resolvedFeeCents,
      depositAmountCents: resolvedDepositCents,
      autopayAmountCents: team.autopayAmountCents,
      autopayDayOfMonth: team.autopayDayOfMonth,
      createdBy: req.user._id,
    });
    return res.status(201).json(registration);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "This player is already registered for this season" });
    }
    console.error("Create registration error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const PARENT_EDITABLE_FIELDS = ["autopayEnabled", "autopayAmountCents", "autopayDayOfMonth"];
const ADMIN_EDITABLE_FIELDS = [
  ...PARENT_EDITABLE_FIELDS,
  "status",
  "registrationFeeCents",
  "depositAmountCents",
];

const updateRegistration = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid registration id" });
  }

  try {
    const registration = await Registration.findById(id);
    if (!registration) return res.status(404).json({ message: "Registration not found" });
    if (!canAccessPlayer(req.user, registration.playerId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const allowedFields =
      req.user.role === "admin" ? ADMIN_EDITABLE_FIELDS : PARENT_EDITABLE_FIELDS;
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const updated = await Registration.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    return res.json(updated);
  } catch (err) {
    console.error("Update registration error:", err);
    return res.status(400).json({ message: err.message });
  }
};

module.exports = {
  listRegistrations,
  getRegistration,
  createRegistration,
  updateRegistration,
};
