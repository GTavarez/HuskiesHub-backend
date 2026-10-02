const { google } = require("googleapis");
const mongoose = require("mongoose");
const Event = require("../events/model");
const Team = require("../teams/model");

const auth = new google.auth.GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});

const calendar = google.calendar({ version: "v3", auth });

// Google Calendar entries to leave out of the site and the subscribe-by-URL
// feed. This site only has read access to that calendar, so an entry that was
// added there by mistake (or is now covered by games entered by hand) can't be
// deleted from here; listing its Google event id hides it instead. Nothing in
// Google is changed. Remove an id to bring the entry back.
const HIDDEN_CALENDAR_EVENT_IDS = new Set([
  "3kc3q7re6keqeenn6m19lc6ij4", // 14U — USA Disorder, Sat Oct 3 2026
  "f2p0pdsp34k7f84gg525r0se5s", // Premier — Jersey Outlaws Fall Showcase, Sat Oct 3 2026
  "kiaqf8em4assi6hnh9n8fou79s", // 18U Gold — Rock Fast Pitch, Sat Oct 3 2026
]);

const isVisibleCalendarEvent = (item) => !HIDDEN_CALENDAR_EVENT_IDS.has(item.id);

const getSchedule = async (req, res) => {
  try {
    const calendarId = process.env.CALENDAR_ID;

    const response = await calendar.events.list({
      calendarId,
      maxResults: 2500,
      singleEvents: true,
      orderBy: "startTime",
      timeMin: new Date("2000-01-01").toISOString(),
    });

    res.json((response.data.items || []).filter(isVisibleCalendarEvent));
  } catch (err) {
    console.error("❌ Google Calendar API Error:", err);
    res.status(500).json({ message: "Error fetching calendar events" });
  }
};

function escapeIcsText(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

function toIcsUtc(date) {
  return `${new Date(date).toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

function toIcsDate(dateStr) {
  return dateStr.replace(/-/g, "");
}

/**
 * GET /api/schedule/ics?teamId=<optional>
 * Public (no auth) — this is meant to be pasted into Apple/Google/Outlook
 * calendar as a "subscribe by URL" feed, and those apps poll it without any
 * auth headers, so it can't sit behind the same login wall as the in-app
 * views. Combines the Google-Calendar-sourced games with this team's DB
 * practices/lessons into one standard .ics feed. Cancelled team events are
 * left out entirely — nothing to sync once it's off.
 */
const getScheduleIcs = async (req, res) => {
  const { teamId } = req.query;

  try {
    let team = null;
    if (teamId) {
      if (!mongoose.Types.ObjectId.isValid(teamId)) {
        return res.status(400).send("Invalid teamId");
      }
      team = await Team.findById(teamId);
      if (!team) return res.status(404).send("Team not found");
    }

    const calendarId = process.env.CALENDAR_ID;
    const gamesResponse = await calendar.events.list({
      calendarId,
      maxResults: 2500,
      singleEvents: true,
      orderBy: "startTime",
      timeMin: new Date("2000-01-01").toISOString(),
    });
    const games = (gamesResponse.data.items || []).filter(isVisibleCalendarEvent);
    // Games aren't tagged with a real teamId — best-effort match against the
    // team name, which is how every game/tournament title is written.
    const teamGames = team
      ? games.filter((g) => (g.summary || "").toLowerCase().includes(team.name.toLowerCase()))
      : games;

    const eventFilter = { status: { $ne: "cancelled" } };
    if (team) eventFilter.teamId = team._id;
    const teamEvents = await Event.find(eventFilter);

    const now = toIcsUtc(new Date());
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//HuskiesHub//Schedule//EN",
      "CALSCALE:GREGORIAN",
      `X-WR-CALNAME:${escapeIcsText(team ? `${team.name} Huskies Schedule` : "Huskies Schedule")}`,
    ];

    teamGames.forEach((game) => {
      const isAllDay = !game.start?.dateTime;
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:game-${game.id}@huskieshub`);
      lines.push(`DTSTAMP:${now}`);
      if (isAllDay) {
        lines.push(`DTSTART;VALUE=DATE:${toIcsDate(game.start.date)}`);
        lines.push(`DTEND;VALUE=DATE:${toIcsDate(game.end.date)}`);
      } else {
        lines.push(`DTSTART:${toIcsUtc(game.start.dateTime)}`);
        lines.push(`DTEND:${toIcsUtc(game.end.dateTime)}`);
      }
      lines.push(`SUMMARY:${escapeIcsText(game.summary)}`);
      if (game.location) lines.push(`LOCATION:${escapeIcsText(game.location)}`);
      lines.push("END:VEVENT");
    });

    teamEvents.forEach((event) => {
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:event-${event._id}@huskieshub`);
      lines.push(`DTSTAMP:${now}`);
      lines.push(`DTSTART:${toIcsUtc(event.startsAt)}`);
      lines.push(`DTEND:${toIcsUtc(event.endsAt)}`);
      lines.push(`SUMMARY:${escapeIcsText(event.title)}`);
      if (event.location) lines.push(`LOCATION:${escapeIcsText(event.location)}`);
      lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");

    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Content-Disposition", 'inline; filename="huskieshub-schedule.ics"');
    return res.send(lines.join("\r\n"));
  } catch (err) {
    console.error("❌ Get schedule ICS error:", err);
    return res.status(500).send("Error generating calendar feed");
  }
};

module.exports = { getSchedule, getScheduleIcs, HIDDEN_CALENDAR_EVENT_IDS };
