const mongoose = require("mongoose");
const Event = require("./model");
const Team = require("../teams/model");
const User = require("../users/model");
const { getTransporter } = require("../../common/utils/mailer");
const { findTeamContacts, withScheduleWatchers } = require("../../common/utils/teamContacts");

// Cloud Run's default timezone is UTC, so a plain toLocaleString() renders
// event times 4-5 hours off from what's actually in the schedule (e.g. a
// 7:00 PM practice showing as 11:00 PM in the email). The club is entirely
// NJ-based, so every notification renders in Eastern time explicitly rather
// than trusting the server's local zone.
const CLUB_TIME_ZONE = "America/New_York";
function formatEventTime(date) {
  return new Date(date).toLocaleString("en-US", { timeZone: CLUB_TIME_ZONE });
}

// Every admin gets a copy of every schedule change — create, edit, cancel,
// delete — regardless of who made it or whether the "email the team"
// checkbox was on for that change. This is the always-on oversight path;
// the team-facing emails above stay opt-in per action.
async function notifyAdminsOfChange({ action, event, team, actorId }) {
  try {
    const [admins, actor] = await Promise.all([
      User.find({ role: "admin" }),
      actorId ? User.findById(actorId) : null,
    ]);
    if (admins.length === 0) return;

    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
    const teamName = team?.name || "Unknown team";
    const actorLabel = actor ? `${actor.name} (${actor.role})` : "Unknown user";

    await Promise.all(
      admins.map((admin) =>
        transporter
          .sendMail({
            from: fromEmail,
            to: admin.email,
            subject: `[Schedule ${action}] ${event.title} — ${teamName}`,
            text: [
              `Hi ${admin.name},`,
              "",
              `${actorLabel} ${action} a schedule entry:`,
              "",
              `${event.type} — ${event.title}`,
              `${teamName}`,
              `${formatEventTime(event.startsAt)} – ${formatEventTime(event.endsAt)}`,
              event.location ? event.location : "Location TBA",
              "",
              "This is a standing copy sent to all admins for every schedule change.",
            ].join("\n"),
          })
          .catch((err) => console.warn("Admin schedule-change email not sent:", err.message))
      )
    );
  } catch (err) {
    console.warn("Admin schedule-change notification skipped:", err.message);
  }
}

const listEvents = async (req, res) => {
  const { teamId, from, to } = req.query;

  if (teamId && !mongoose.Types.ObjectId.isValid(teamId)) {
    return res.status(400).json({ message: "Invalid teamId" });
  }
  // Only an admin may list across every team at once (e.g. the site-wide
  // Schedule calendar) — everyone else must scope to a real teamId.
  if (!teamId && req.user.role !== "admin") {
    return res.status(400).json({ message: "Valid teamId is required" });
  }

  const filter = {};
  if (teamId) filter.teamId = teamId;
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
  const { type, teamId, title, startsAt, endsAt, location, googleEventId, notifyTeam } = req.body;

  if (!type || !teamId || !title || !startsAt || !endsAt) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // A coach can only add to their own team's schedule, never another team's
  // — mirrors the same restriction on announcements.
  if (req.user.role === "coach" && String(teamId) !== String(req.user.teamId)) {
    return res.status(403).json({ message: "You can only add events to your own team's schedule" });
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

    if (notifyTeam) {
      notifyEventCreated(event);
    }
    Team.findById(teamId).then((team) =>
      notifyAdminsOfChange({ action: "added", event, team, actorId: req.user._id })
    );

    return res.status(201).json(event);
  } catch (err) {
    console.error("Create event error:", err);
    return res.status(400).json({ message: err.message });
  }
};

// Best-effort — matches the pattern used for every other transactional email
// in this app. Fires only when the admin/coach opts in at creation time.
async function notifyEventCreated(event) {
  try {
    const [team, teamContacts] = await Promise.all([
      Team.findById(event.teamId),
      findTeamContacts(event.teamId),
    ]);
    const contacts = await withScheduleWatchers(teamContacts);
    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
    const typeLabel = event.type.charAt(0).toUpperCase() + event.type.slice(1);

    await Promise.all(
      contacts.map((user) =>
        transporter
          .sendMail({
            from: fromEmail,
            to: user.email,
            subject: `New ${event.type}: ${event.title} (${team?.name || "your team"})`,
            text: [
              `Hi ${user.name},`,
              "",
              `A new ${typeLabel.toLowerCase()} has been added to the schedule:`,
              "",
              event.title,
              `${formatEventTime(event.startsAt)} – ${formatEventTime(event.endsAt)}`,
              event.location ? event.location : "Location TBA",
              "",
              "Log in to HuskiesHub to see the full schedule.",
            ].join("\n"),
          })
          .catch((err) => console.warn("New event email not sent:", err.message))
      )
    );
  } catch (err) {
    console.warn("New event notification skipped:", err.message);
  }
}

// Best-effort — matches the pattern used for every other transactional email
// in this app. Only fires when something the family would actually care
// about changed, so an edit that touched nothing visible doesn't spam them.
async function notifyEventUpdated(before, after) {
  try {
    const changes = [];
    if (before.title !== after.title) {
      changes.push(`Title: "${before.title}" → "${after.title}"`);
    }
    if (before.startsAt.getTime() !== after.startsAt.getTime()) {
      changes.push(`Starts: ${formatEventTime(before.startsAt)} → ${formatEventTime(after.startsAt)}`);
    }
    if (before.endsAt.getTime() !== after.endsAt.getTime()) {
      changes.push(`Ends: ${formatEventTime(before.endsAt)} → ${formatEventTime(after.endsAt)}`);
    }
    if ((before.location || "") !== (after.location || "")) {
      changes.push(`Location: "${before.location || "TBA"}" → "${after.location || "TBA"}"`);
    }
    if (changes.length === 0) return;

    const [team, teamContacts] = await Promise.all([
      Team.findById(after.teamId),
      findTeamContacts(after.teamId),
    ]);
    const contacts = await withScheduleWatchers(teamContacts);
    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;

    await Promise.all(
      contacts.map((user) =>
        transporter
          .sendMail({
            from: fromEmail,
            to: user.email,
            subject: `Updated: ${after.title} (${team?.name || "your team"})`,
            text: [
              `Hi ${user.name},`,
              "",
              `"${after.title}" has been updated:`,
              "",
              ...changes,
              "",
              "Log in to HuskiesHub to see the full schedule.",
            ].join("\n"),
          })
          .catch((err) => console.warn("Event update email not sent:", err.message))
      )
    );
  } catch (err) {
    console.warn("Event update notification skipped:", err.message);
  }
}

/**
 * PATCH /api/events/:id
 * Body may include { notifyTeam: boolean } — same explicit-opt-in pattern as
 * cancelEvent: editing never auto-emails, the admin/coach chooses each time.
 */
const updateEvent = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid event id" });
  }

  const { title, startsAt, endsAt, location, notifyTeam } = req.body;

  try {
    const before = await Event.findById(id);
    if (!before) return res.status(404).json({ message: "Event not found" });

    // A coach can edit any event on their own team, but not another team's —
    // not limited to events they personally created.
    if (req.user.role === "coach" && String(before.teamId) !== String(req.user.teamId)) {
      return res.status(403).json({ message: "You can only edit your own team's events" });
    }

    const event = await Event.findByIdAndUpdate(
      id,
      { title, startsAt, endsAt, location },
      { new: true, runValidators: true }
    );

    if (notifyTeam) {
      notifyEventUpdated(before, event);
    }
    Team.findById(event.teamId).then((team) =>
      notifyAdminsOfChange({ action: "edited", event, team, actorId: req.user._id })
    );

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

    Team.findById(event.teamId).then((team) =>
      notifyAdminsOfChange({ action: "deleted", event, team, actorId: req.user._id })
    );

    return res.status(204).send();
  } catch (err) {
    console.error("Delete event error:", err);
    return res.status(500).json({ message: "Failed to delete event" });
  }
};

// Best-effort — matches the pattern used for every other transactional email
// in this app (announcement/payment/lesson reminders).
async function notifyEventCancelled(event) {
  try {
    const [team, teamContacts] = await Promise.all([
      Team.findById(event.teamId),
      findTeamContacts(event.teamId),
    ]);
    const contacts = await withScheduleWatchers(teamContacts);
    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;

    await Promise.all(
      contacts.map((user) =>
        transporter
          .sendMail({
            from: fromEmail,
            to: user.email,
            subject: `Cancelled: ${event.title} (${team?.name || "your team"})`,
            text: [
              `Hi ${user.name},`,
              "",
              `"${event.title}" on ${formatEventTime(event.startsAt)} has been cancelled.`,
              "",
              "Log in to HuskiesHub to see the full schedule.",
            ].join("\n"),
          })
          .catch((err) => console.warn("Cancellation email not sent:", err.message))
      )
    );
  } catch (err) {
    console.warn("Event cancellation notification skipped:", err.message);
  }
}

/**
 * PATCH /api/events/:id/cancel
 * Body: { notifyTeam: boolean } — cancelling never auto-emails; the admin/
 * coach doing it explicitly opts in each time, since not every cancelled
 * lesson/optional session needs a team-wide email.
 */
const cancelEvent = async (req, res) => {
  const { id } = req.params;
  const { notifyTeam } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid event id" });
  }

  try {
    const existing = await Event.findById(id);
    if (!existing) return res.status(404).json({ message: "Event not found" });

    // Same team-scoping as edit — a coach can cancel any event on their own
    // team, not just ones they created, but never another team's.
    if (req.user.role === "coach" && String(existing.teamId) !== String(req.user.teamId)) {
      return res.status(403).json({ message: "You can only cancel your own team's events" });
    }

    const event = await Event.findByIdAndUpdate(
      id,
      { status: "cancelled", cancelledAt: new Date() },
      { new: true }
    );

    if (notifyTeam) {
      notifyEventCancelled(event);
    }
    Team.findById(event.teamId).then((team) =>
      notifyAdminsOfChange({ action: "cancelled", event, team, actorId: req.user._id })
    );

    return res.json(event);
  } catch (err) {
    console.error("Cancel event error:", err);
    return res.status(500).json({ message: "Failed to cancel event" });
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
    if (event.status === "cancelled") {
      return res.status(400).json({ message: "This event has been cancelled" });
    }

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
  cancelEvent,
  upsertRsvp,
};
