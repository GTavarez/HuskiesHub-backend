const mongoose = require("mongoose");
const Tryout = require("./model");
const Player = require("../players/model");
const Team = require("../teams/model");
const { getTransporter } = require("../../common/utils/mailer");
const { cleanTryoutSubmission, STATUSES } = require("./validate");
const { formatTryoutNotice, formatTryoutConfirmation, SCHEDULING_EMAIL } = require("./emails");

const fromEmail = () => process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;

// The registration is already saved by the time these run, so a mail problem is
// logged and never turns a saved registration into an error for the parent.
async function sendTryoutEmails(tryout) {
  try {
    const transporter = getTransporter();
    const notice = formatTryoutNotice(tryout);
    const recipients = (process.env.TRYOUT_ALERT_EMAILS || SCHEDULING_EMAIL)
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean);
    await transporter.sendMail({
      from: fromEmail(),
      to: recipients,
      replyTo: tryout.parentEmail,
      subject: notice.subject,
      text: notice.text,
    });
    const confirmation = formatTryoutConfirmation(tryout);
    await transporter.sendMail({
      from: fromEmail(),
      to: tryout.parentEmail,
      replyTo: SCHEDULING_EMAIL,
      subject: confirmation.subject,
      text: confirmation.text,
    });
  } catch (err) {
    console.warn("Tryout emails not sent:", err.message);
  }
}

/**
 * POST /api/tryouts   (public, no account)
 * Body: { playerName, ageGroup, birthDate?, position, currentTeam?,
 *         previousClubExperience?, parentName, parentEmail, parentPhone }
 */
const createTryout = async (req, res) => {
  // Hidden field a person never sees. A bot that fills every box fills this one,
  // so answer as if it worked and save nothing.
  if (req.body?.website) return res.status(201).json({ message: "Registration received." });

  const { error, data } = cleanTryoutSubmission(req.body);
  if (error) return res.status(400).json({ message: error });

  try {
    const tryout = await Tryout.create(data);
    await sendTryoutEmails(tryout);
    return res.status(201).json({ message: "Registration received." });
  } catch (err) {
    console.error("Create tryout error:", err);
    return res.status(500).json({ message: "Could not save your registration. Please try again." });
  }
};

/** GET /api/tryouts?status=new|scheduled|passed|joined   (admin) */
const listTryouts = async (req, res) => {
  const filter = {};
  if (req.query.status) {
    if (!STATUSES.includes(req.query.status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    filter.status = req.query.status;
  }
  try {
    const tryouts = await Tryout.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    return res.json(tryouts);
  } catch (err) {
    console.error("List tryouts error:", err);
    return res.status(500).json({ message: "Failed to load tryouts" });
  }
};

/**
 * PATCH /api/tryouts/:id/status   (admin)
 * Only the steps before a team move. "joined" is set by moving her to a team.
 */
const updateTryoutStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
  if (!["new", "scheduled", "passed"].includes(status)) {
    return res.status(400).json({ message: "Status must be new, scheduled or passed" });
  }
  try {
    const tryout = await Tryout.findOneAndUpdate(
      { _id: id, status: { $ne: "joined" } },
      { status },
      { new: true }
    );
    if (!tryout) return res.status(404).json({ message: "Tryout not found, or she is already on a team" });
    return res.json(tryout);
  } catch (err) {
    console.error("Update tryout status error:", err);
    return res.status(500).json({ message: "Failed to update tryout" });
  }
};

/**
 * POST /api/tryouts/:id/move-to-team   (admin)
 * Body: { teamId, jersey? }
 * Creates her player record on that team and marks the tryout joined.
 */
const moveTryoutToTeam = async (req, res) => {
  const { id } = req.params;
  const { teamId, jersey } = req.body || {};
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
  if (!mongoose.Types.ObjectId.isValid(teamId)) return res.status(400).json({ message: "Choose a team" });

  let jerseyNumber;
  if (jersey !== undefined && jersey !== null && jersey !== "") {
    jerseyNumber = Number(jersey);
    if (!Number.isInteger(jerseyNumber) || jerseyNumber < 0 || jerseyNumber > 99) {
      return res.status(400).json({ message: "Jersey must be a number from 0 to 99" });
    }
  }

  try {
    const team = await Team.findById(teamId);
    if (!team) return res.status(404).json({ message: "Team not found" });

    // Claim the tryout first so two clicks can't make two players.
    const tryout = await Tryout.findOneAndUpdate(
      { _id: id, status: { $ne: "joined" } },
      { status: "joined", teamId },
      { new: false }
    );
    if (!tryout) {
      return res.status(409).json({ message: "Tryout not found, or she is already on a team" });
    }

    try {
      const player = await Player.create({
        name: tryout.playerName,
        position: tryout.position,
        teamId,
        ...(jerseyNumber !== undefined ? { jersey: jerseyNumber } : {}),
        contactEmail: tryout.parentEmail,
        phone: tryout.parentPhone,
      });
      await Tryout.findByIdAndUpdate(id, { playerId: player._id });
      return res.status(201).json(player);
    } catch (err) {
      await Tryout.findByIdAndUpdate(id, { status: tryout.status, teamId: null, playerId: null });
      if (err.code === 11000) {
        return res.status(409).json({ message: "A player with that name and jersey number is already on that team" });
      }
      throw err;
    }
  } catch (err) {
    console.error("Move tryout to team error:", err);
    return res.status(500).json({ message: "Failed to move her to the team" });
  }
};

/** DELETE /api/tryouts/:id   (admin) Removes a registration (spam, duplicates, tests). */
const deleteTryout = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
  try {
    const removed = await Tryout.findByIdAndDelete(id);
    if (!removed) return res.status(404).json({ message: "Tryout not found" });
    return res.json({ message: "Removed" });
  } catch (err) {
    console.error("Delete tryout error:", err);
    return res.status(500).json({ message: "Failed to remove tryout" });
  }
};

module.exports = { createTryout, listTryouts, updateTryoutStatus, moveTryoutToTeam, deleteTryout };
