const mongoose = require("mongoose");
const Player = require("./model");
const User = require("../users/model");
const Team = require("../teams/model");
const { canAccessPlayerScoped } = require("../../common/utils/ownership");
const { findTeamContacts } = require("../../common/utils/teamContacts");

function csvField(value) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

// teamId and role are deliberately excluded — team assignment stays an
// admin/coach decision, and role is an internal chat/permissions field, not
// part of a player's public profile.
const EDITABLE_FIELDS = [
  "name",
  "jersey",
  "position",
  "gradYear",
  "highSchool",
  "state",
  "GPA",
  "isCommitted",
  "committedCollege",
  "battingThrowing",
  "contactEmail",
  "bio",
  "funFacts",
];

/**
 * POST /api/players
 * Body (JSON): { name, jersey, position, gradYear, highSchool, GPA, image, teamId }
 */
const createPlayer = async (req, res) => {
  try {
    const player = await Player.create(req.body);
    return res.status(201).json(player);
  } catch (err) {
    console.error("Create player error:", err);
    return res.status(400).json({ message: err.message });
  }
};

/**
 * GET /api/players/team/:teamId
 */
const getTeamPlayers = async (req, res) => {
  const { teamId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    return res.status(400).json({ message: "Invalid teamId" });
  }

  try {
    const players = await Player.find({
      teamId,
      removedFromRoster: { $ne: true },
    }).sort({ jersey: 1 });
    return res.json(players);
  } catch (err) {
    console.error("Get players by team error:", err);
    return res.status(500).json({ message: "Failed to fetch players" });
  }
};

/**
 * POST /api/players/admin/players/image
 */
const uploadPlayerImage = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "No file uploaded" });
  }

  const { filename } = req.file;
  const relativeUrl = `/players/${filename}`;
  const fullUrl = `${req.protocol}://${req.get("host")}${relativeUrl}`;

  return res.status(201).json({
    message: "Player image uploaded successfully",
    filename,
    url: relativeUrl,
    fullUrl,
  });
};

/**
 * PATCH /api/players/:playerId
 * Ownership-gated: admin, a coach for their own team's players, the player's
 * linked parent, or the player themself (via canAccessPlayerScoped). Only
 * whitelisted profile fields are
 * writable — team assignment and the internal chat role are not.
 */
const updatePlayer = async (req, res) => {
  const { playerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ message: "Invalid playerId" });
  }

  if (!(await canAccessPlayerScoped(req.user, playerId))) {
    return res.status(403).json({ message: "Forbidden" });
  }

  const updates = {};
  for (const field of EDITABLE_FIELDS) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  // Frontend sends funFacts as a plain string list; the schema stores each
  // one as a subdocument (text + createdAt) — normalize here rather than
  // pushing that shape onto every caller.
  if (updates.funFacts) {
    updates.funFacts = updates.funFacts
      .map((fact) => (typeof fact === "string" ? fact : fact?.text))
      .filter((text) => text && text.trim())
      .map((text) => ({ text: text.trim(), createdAt: new Date() }));
  }

  try {
    const player = await Player.findByIdAndUpdate(playerId, updates, {
      new: true,
      runValidators: true,
    });
    if (!player) {
      return res.status(404).json({ message: "Player not found" });
    }
    return res.json(player);
  } catch (err) {
    console.error("Update player error:", err);
    return res.status(400).json({ message: err.message });
  }
};

/**
 * DELETE /api/players/:playerId
 * Admin (any player) or coach (their own team's players only) — deliberately
 * NOT reachable via canAccessPlayer's parent/player branches, since removing
 * a roster entry is a roster-management action, not a profile edit a family
 * should be able to trigger themselves. This is a SOFT delete: it flips
 * removedFromRoster so the player drops out of team rosters/PDFs, but the
 * Player document (and anything referencing its id — registrations, chat
 * history) stays in the database.
 */
const deletePlayer = async (req, res) => {
  const { playerId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ message: "Invalid playerId" });
  }
  if (!["admin", "coach"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const player = await Player.findById(playerId);
    if (!player) {
      return res.status(404).json({ message: "Player not found" });
    }
    if (
      req.user.role === "coach" &&
      (!player.teamId || player.teamId.toString() !== req.user.teamId?.toString())
    ) {
      return res.status(403).json({ message: "That player is not on your team" });
    }

    player.removedFromRoster = true;
    await player.save();
    return res.json({ removed: true });
  } catch (err) {
    console.error("Delete player error:", err);
    return res.status(500).json({ message: "Failed to delete player" });
  }
};

/**
 * GET /api/players/export/contacts
 * Admin-only. One row per player, with every linked parent account's
 * name/email/phone joined into that row (a player can have more than one
 * parent account, e.g. both parents signed up separately) — mirrors the
 * QuickBooks CSV export in payments/controller.js.
 */
const exportContactsCsv = async (req, res) => {
  try {
    const [players, teams, parents] = await Promise.all([
      Player.find({ removedFromRoster: { $ne: true } }).sort({ teamId: 1, name: 1 }),
      Team.find({}),
      User.find({ children: { $exists: true, $not: { $size: 0 } } }),
    ]);

    const teamNameById = new Map(teams.map((t) => [t._id.toString(), t.name]));

    const contactsByPlayerId = new Map();
    parents.forEach((parent) => {
      (parent.children || []).forEach((childId) => {
        const key = childId.toString();
        const existing = contactsByPlayerId.get(key) || [];
        existing.push(parent);
        contactsByPlayerId.set(key, existing);
      });
    });

    const rows = [["Team", "Player", "Parent Name", "Parent Email", "Parent Phone"]];
    players.forEach((player) => {
      const teamName = teamNameById.get(player.teamId?.toString()) || "";
      const contacts = contactsByPlayerId.get(player._id.toString()) || [];
      if (contacts.length === 0) {
        rows.push([teamName, player.name, "", "", ""]);
        return;
      }
      contacts.forEach((parent) => {
        rows.push([teamName, player.name, parent.name, parent.email, parent.phone || ""]);
      });
    });

    const csv = rows.map((row) => row.map(csvField).join(",")).join("\n");

    res.set("Content-Type", "text/csv");
    res.set("Content-Disposition", 'attachment; filename="huskieshub-player-contacts.csv"');
    return res.send(csv);
  } catch (err) {
    console.error("Export player contacts CSV error:", err);
    return res.status(500).json({ message: "Failed to export contacts" });
  }
};

/**
 * GET /api/players/team/:teamId/contacts
 * Admin (any team) or coach (their own team only). Flat contact list for
 * everyone tied to the team — parents, self-managed player accounts, and
 * coaches — via the same resolver used for team-wide emails, so "who's
 * reachable for this team" stays defined in one place. `name` stays the
 * account holder's own name (used when actually contacting someone); a
 * separate `attendeeName` resolves to the roster player's name for RSVP/
 * attendance display, so a parent marking attendance for their kid shows
 * the player's name there instead of the parent's.
 */
const getTeamContacts = async (req, res) => {
  const { teamId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(teamId)) {
    return res.status(400).json({ message: "Invalid teamId" });
  }
  if (req.user.role === "coach" && req.user.teamId?.toString() !== teamId) {
    return res.status(403).json({ message: "That's not your team" });
  }
  if (!["admin", "coach"].includes(req.user.role)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const [contacts, players] = await Promise.all([
      findTeamContacts(teamId),
      Player.find({ teamId, removedFromRoster: { $ne: true } }, "_id name"),
    ]);
    const playerNameById = new Map(players.map((p) => [String(p._id), p.name]));

    return res.json(
      contacts.map((u) => {
        let attendeeName = u.name;
        if (u.role === "parent" && Array.isArray(u.children)) {
          const childName = u.children
            .map((childId) => playerNameById.get(String(childId)))
            .find(Boolean);
          if (childName) attendeeName = childName;
        } else if (u.role === "player" && u.playerId) {
          attendeeName = playerNameById.get(String(u.playerId)) || u.name;
        }

        return {
          _id: u._id,
          name: u.name,
          attendeeName,
          email: u.email,
          phone: u.phone || "",
          role: u.role,
          children: u.children || [],
          playerId: u.playerId || null,
        };
      })
    );
  } catch (err) {
    console.error("Get team contacts error:", err);
    return res.status(500).json({ message: "Failed to fetch team contacts" });
  }
};

module.exports = {
  createPlayer,
  getTeamPlayers,
  uploadPlayerImage,
  updatePlayer,
  deletePlayer,
  exportContactsCsv,
  getTeamContacts,
};
