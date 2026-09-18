const { google } = require("googleapis");
const Payment = require("../payments/model");
const { computeRegistrationBalance } = require("../payments/controller");
const Registration = require("../registrations/model");
const Event = require("../events/model");
const Attendance = require("../attendance/model");
const PlayerNote = require("../player-notes/model");
const Tournament = require("../tournaments/model");
const LessonSlot = require("../lesson-slots/model");
const CoachPayment = require("../payroll/model");
const HotelReservation = require("../tournaments/hotelReservationModel");

const calendarAuth = new google.auth.GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});
const calendar = google.calendar({ version: "v3", auth: calendarAuth });

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function getOrgRevenue(from, to) {
  const rangeStart = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
  const rangeEnd = to ? new Date(to) : new Date();

  const result = await Payment.aggregate([
    { $match: { status: "succeeded", createdAt: { $gte: rangeStart, $lte: rangeEnd } } },
    { $group: { _id: null, total: { $sum: "$amountCents" } } },
  ]);
  return result[0]?.total || 0;
}

async function getOutstandingBalances() {
  const registrations = await Registration.find({ status: { $ne: "withdrawn" } });
  const balances = await Promise.all(registrations.map(computeRegistrationBalance));
  return balances.reduce((sum, balance) => sum + balance.balanceCents, 0);
}

async function getPracticeAttendanceRate() {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const practiceEvents = await Event.find({ type: "practice", startsAt: { $gte: since } }, "_id");
  const eventIds = practiceEvents.map((event) => event._id);
  if (eventIds.length === 0) return null;

  const grouped = await Attendance.aggregate([
    { $match: { eventId: { $in: eventIds } } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const total = grouped.reduce((sum, group) => sum + group.count, 0);
  if (total === 0) return null;
  const present = grouped.find((group) => group._id === "present")?.count || 0;
  return Math.round((present / total) * 100);
}

// Documented simplification: counts players with a recent injury-type coach
// note, not a real medical-clearance/return-to-play system. Surface this
// caveat in the tile's UI copy, not just here.
async function getPlayersAtInjuryRisk() {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const result = await PlayerNote.aggregate([
    { $match: { type: "injury", createdAt: { $gte: since } } },
    { $group: { _id: "$playerId" } },
  ]);
  return result.length;
}

async function getUpcomingTournamentsCount() {
  return Tournament.countDocuments({ startDate: { $gte: new Date() } });
}

async function getOpenLessonSlotsCount() {
  return LessonSlot.countDocuments({
    $expr: { $lt: ["$bookedCount", "$capacity"] },
    startsAt: { $gte: new Date() },
  });
}

async function getCoachesPaidRate() {
  const latest = await CoachPayment.findOne().sort({ payPeriodEnd: -1 });
  if (!latest) return null;

  const periodPayments = await CoachPayment.find({ payPeriodEnd: latest.payPeriodEnd });
  const paidCount = periodPayments.filter((payment) => payment.status === "paid").length;
  return Math.round((paidCount / periodPayments.length) * 100);
}

async function getPendingHotelReservationsCount() {
  return HotelReservation.countDocuments({ status: "pending" });
}

// Google Calendar locations are free-text addresses ("6600 Whitepine Rd
// Richmond, VA, United States"), not the "City,State,Country" format
// OpenWeather's lookup expects. Strip everything through the last
// street-suffix word so "6600 Whitepine Rd Richmond, VA, United States"
// becomes "Richmond, VA, US" — a query OpenWeather can actually resolve.
const STREET_SUFFIXES =
  "Rd|Road|St|Street|Ave|Avenue|Dr|Drive|Blvd|Boulevard|Way|Ln|Lane|Ct|Court|Pl|Place|Hwy|Highway|Pkwy|Parkway";

function extractCityQuery(location) {
  if (!location) return "New York,US";
  const suffixPattern = new RegExp(`\\b(${STREET_SUFFIXES})\\b\\.?`, "gi");
  let match;
  let lastEnd = -1;
  // eslint-disable-next-line no-cond-assign
  while ((match = suffixPattern.exec(location)) !== null) {
    lastEnd = match.index + match[0].length;
  }
  const remainder = lastEnd >= 0 ? location.slice(lastEnd) : location;
  let cleaned = remainder
    .replace(/\n/g, ", ")
    .replace(/^[,\s]+/, "")
    .replace(/\b\d{5}(-\d{4})?\b/g, "")
    .replace(/united states/i, "US")
    .replace(/\bUSA\b/i, "US")
    .replace(/,\s*,/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!cleaned) return "New York,US";

  // OpenWeather's city lookup 404s on "City,State" alone (e.g. "Ringwood,NJ")
  // — it needs a country code to resolve, and a 2-letter US state code
  // (which our event locations almost always end in, e.g. "Town, NJ") looks
  // just like one to a naive check. Every club location is US-based, so
  // just always end the query in ",US" unless it's already there.
  if (!/,\s*US$/i.test(cleaned)) {
    cleaned = `${cleaned},US`;
  }

  return cleaned;
}

// Google Calendar holds games/tournaments; the Mongo Event collection holds
// practices, bullpens, and lessons (see events/controller.js). Weather
// alerts need both — most of what's actually on a given team's schedule
// day-to-day is practices, which only live in the DB, not the calendar.
async function getUpcomingCalendarEvents(now, until) {
  const calendarId = process.env.CALENDAR_ID;
  if (!calendarId) return [];

  const response = await calendar.events.list({
    calendarId,
    singleEvents: true,
    orderBy: "startTime",
    timeMin: now.toISOString(),
    timeMax: until.toISOString(),
  });

  return response.data.items || [];
}

// Normalizes a DB Event into the same {start:{dateTime}, location} shape
// getUpcomingCalendarEvents returns, so both sources can feed one merge below.
async function getUpcomingDbEvents(now, until) {
  const events = await Event.find({
    status: "scheduled",
    startsAt: { $gte: now, $lte: until },
  }).lean();

  return events.map((event) => ({
    start: { dateTime: event.startsAt.toISOString() },
    location: event.location || "",
  }));
}

async function getWeatherAlerts() {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return { configured: false, alerts: [] };

  const now = new Date();
  const until = new Date(now.getTime() + SEVEN_DAYS_MS);
  let upcoming = [];
  try {
    const [calendarEvents, dbEvents] = await Promise.all([
      getUpcomingCalendarEvents(now, until),
      getUpcomingDbEvents(now, until),
    ]);
    upcoming = [...calendarEvents, ...dbEvents];
  } catch (err) {
    console.warn("Weather alerts: failed to load upcoming events:", err.message);
    return { configured: true, alerts: [] };
  }

  const byDateLocation = new Map();
  upcoming.forEach((event) => {
    const start = event.start?.dateTime || event.start?.date;
    if (!start) return;
    const dateKey = start.slice(0, 10);
    const key = `${dateKey}|${event.location || "default"}`;
    if (!byDateLocation.has(key)) {
      byDateLocation.set(key, { date: dateKey, location: event.location || "default" });
    }
  });

  const alerts = await Promise.all(
    Array.from(byDateLocation.values()).map(async ({ date, location }) => {
      try {
        const query = location !== "default" ? extractCityQuery(location) : "New York,US";
        const response = await fetch(
          `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(query)}&appid=${apiKey}&units=imperial`
        );
        if (!response.ok) return null;
        const data = await response.json();

        const dayForecasts = (data.list || []).filter((entry) => entry.dt_txt?.startsWith(date));
        const rainy = dayForecasts.find(
          (entry) =>
            (entry.pop || 0) >= 0.5 ||
            ["Rain", "Thunderstorm", "Snow"].includes(entry.weather?.[0]?.main)
        );
        if (!rainy) return null;

        return { date, location, condition: rainy.weather?.[0]?.main || "Precipitation" };
      } catch (err) {
        console.warn("Weather alert lookup failed:", err.message);
        return null;
      }
    })
  );

  return { configured: true, alerts: alerts.filter(Boolean) };
}

module.exports = {
  getOrgRevenue,
  getOutstandingBalances,
  getPracticeAttendanceRate,
  getPlayersAtInjuryRisk,
  getUpcomingTournamentsCount,
  getOpenLessonSlotsCount,
  getCoachesPaidRate,
  getPendingHotelReservationsCount,
  getWeatherAlerts,
};
