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

async function getWeatherAlerts() {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return { configured: false, alerts: [] };

  const now = new Date();
  const upcoming = await Event.find({
    startsAt: { $gte: now, $lte: new Date(now.getTime() + SEVEN_DAYS_MS) },
  });

  const byDateLocation = new Map();
  upcoming.forEach((event) => {
    const dateKey = event.startsAt.toISOString().slice(0, 10);
    const key = `${dateKey}|${event.location || "default"}`;
    if (!byDateLocation.has(key)) {
      byDateLocation.set(key, { date: dateKey, location: event.location || "default" });
    }
  });

  const alerts = await Promise.all(
    Array.from(byDateLocation.values()).map(async ({ date, location }) => {
      try {
        const query = location !== "default" ? location : "New York,US";
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
