const Event = require("../events/model");
const Player = require("../players/model");
const LessonRequestSlot = require("../lesson-requests/model");
const { getTransporter } = require("../../common/utils/mailer");
const { findTeamContacts } = require("../../common/utils/teamContacts");

const WINDOW_DAYS = 7;
const DAY_LABEL_TO_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

// Recurring weekly slots don't carry a calendar date — this projects the
// next real occurrence of a given day label (e.g. "Mon") from today,
// counting today itself as a match (so a same-day lesson still shows up).
function nextOccurrence(dayOfWeek, fromDate = startOfToday()) {
  const targetIndex = DAY_LABEL_TO_INDEX[dayOfWeek];
  if (targetIndex === undefined) return null;
  const diff = (targetIndex - fromDate.getDay() + 7) % 7;
  const result = new Date(fromDate);
  result.setDate(result.getDate() + diff);
  return result;
}

// Resolves which team(s) a user should see practice/game reminders for —
// their own team (player/coach) or their linked children's team(s) (parent).
async function getUserTeamIds(user) {
  if (["player", "coach"].includes(user.role) && user.teamId) {
    return [user.teamId.toString()];
  }
  if (user.role === "parent" && user.children?.length) {
    const children = await Player.find({ _id: { $in: user.children } }, "teamId");
    return [...new Set(children.map((c) => c.teamId?.toString()).filter(Boolean))];
  }
  return [];
}

/**
 * GET /api/notifications/upcoming
 * Everything relevant to the logged-in user in the next 7 days: team
 * practices/games (with their own RSVP status if any) and any confirmed
 * private lesson slot tied to their email.
 */
const getUpcoming = async (req, res) => {
  try {
    const teamIds = await getUserTeamIds(req.user);
    const windowEnd = new Date(startOfToday());
    windowEnd.setDate(windowEnd.getDate() + WINDOW_DAYS);

    const events = teamIds.length
      ? await Event.find({
          teamId: { $in: teamIds },
          startsAt: { $gte: startOfToday(), $lte: windowEnd },
        }).sort({ startsAt: 1 })
      : [];

    const upcomingEvents = events.map((e) => {
      const mine = e.rsvps.find((r) => r.userId.toString() === req.user._id.toString());
      return {
        id: e._id,
        kind: "event",
        type: e.type,
        title: e.title,
        startsAt: e.startsAt,
        endsAt: e.endsAt,
        location: e.location,
        myRsvp: mine?.status || null,
      };
    });

    const confirmedSlots = req.user.email
      ? await LessonRequestSlot.find({ status: "confirmed", parentEmail: req.user.email })
      : [];

    const upcomingLessons = confirmedSlots
      .map((slot) => {
        const date = nextOccurrence(slot.dayOfWeek);
        if (!date || date > windowEnd) return null;
        return {
          id: slot._id,
          kind: "lesson",
          title: `Private lesson — ${slot.athleteName}`,
          startsAt: date,
          timeLabel: slot.timeLabel,
          location: slot.location,
        };
      })
      .filter(Boolean);

    const upcoming = [...upcomingEvents, ...upcomingLessons].sort(
      (a, b) => new Date(a.startsAt) - new Date(b.startsAt)
    );

    return res.json(upcoming);
  } catch (err) {
    console.error("Get upcoming notifications error:", err);
    return res.status(500).json({ message: "Failed to fetch upcoming notifications" });
  }
};

async function sendEventReminder(event) {
  const contacts = await findTeamContacts(event.teamId);
  const transporter = getTransporter();
  const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
  let sent = 0;
  for (const user of contacts) {
    const alreadyConfirmed = event.rsvps.some(
      (r) => r.userId.toString() === user._id.toString() && r.status === "yes"
    );
    if (alreadyConfirmed) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      await transporter.sendMail({
        from: fromEmail,
        to: user.email,
        subject: `Reminder: ${event.title} tomorrow`,
        text: [
          `Hi ${user.name},`,
          "",
          `This is a reminder that "${event.title}" is tomorrow.`,
          `Location: ${event.location || "TBA"}`,
          "",
          "Please log in to confirm your attendance if you haven't already.",
        ].join("\n"),
      });
      sent += 1;
    } catch (err) {
      console.warn("Event reminder email not sent:", err.message);
    }
  }
  return sent;
}

async function sendLessonReminder(slot) {
  if (!slot.parentEmail) return false;
  try {
    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
    await transporter.sendMail({
      from: fromEmail,
      to: slot.parentEmail,
      subject: `Reminder: ${slot.athleteName}'s lesson tomorrow`,
      text: [
        `Hi ${slot.parentName},`,
        "",
        `This is a reminder that ${slot.athleteName}'s private lesson is tomorrow, ${slot.timeLabel} at ${slot.location}.`,
        "",
        "See you then!",
      ].join("\n"),
    });
    return true;
  } catch (err) {
    console.warn("Lesson reminder email not sent:", err.message);
    return false;
  }
}

/**
 * POST /api/notifications/run-reminder-cron
 * Shared-secret-authenticated (Cloud Scheduler), same pattern as the
 * payments autopay cron — no user session behind a scheduled job.
 */
const runReminderCron = async (req, res) => {
  if (req.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const tomorrowStart = new Date(startOfToday());
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
    const tomorrowDayLabel = Object.keys(DAY_LABEL_TO_INDEX).find(
      (label) => DAY_LABEL_TO_INDEX[label] === tomorrowStart.getDay()
    );

    const events = await Event.find({ startsAt: { $gte: tomorrowStart, $lt: tomorrowEnd } });
    const eventResults = await Promise.all(events.map(sendEventReminder));

    const slots = await LessonRequestSlot.find({
      status: "confirmed",
      dayOfWeek: tomorrowDayLabel,
    });
    const slotResults = await Promise.all(slots.map(sendLessonReminder));

    return res.json({
      eventsProcessed: events.length,
      eventRemindersSent: eventResults.reduce((sum, n) => sum + n, 0),
      lessonsProcessed: slots.length,
      lessonRemindersSent: slotResults.filter(Boolean).length,
    });
  } catch (err) {
    console.error("Run reminder cron error:", err);
    return res.status(500).json({ message: "Failed to run reminders" });
  }
};

module.exports = { getUpcoming, runReminderCron };
