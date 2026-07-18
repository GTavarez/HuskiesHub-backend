const service = require("./service");

// Each tile is its own Promise.allSettled entry — not Promise.all — so one
// failing tile (most likely weather, an external API call) degrades that one
// tile to null instead of 500ing the entire dashboard.
const getDashboard = async (req, res) => {
  const { from, to } = req.query;

  const [
    revenue,
    outstandingBalance,
    practiceAttendanceRate,
    playersAtInjuryRisk,
    upcomingTournaments,
    openLessonSlots,
    coachesPaidRate,
    pendingHotelReservations,
    weather,
  ] = await Promise.allSettled([
    service.getOrgRevenue(from, to),
    service.getOutstandingBalances(),
    service.getPracticeAttendanceRate(),
    service.getPlayersAtInjuryRisk(),
    service.getUpcomingTournamentsCount(),
    service.getOpenLessonSlotsCount(),
    service.getCoachesPaidRate(),
    service.getPendingHotelReservationsCount(),
    service.getWeatherAlerts(),
  ]);

  const value = (result) => (result.status === "fulfilled" ? result.value : null);
  if (weather.status === "rejected") {
    console.error("Weather alerts tile failed:", weather.reason);
  }

  return res.json({
    orgRevenueCents: value(revenue),
    outstandingBalanceCents: value(outstandingBalance),
    practiceAttendanceRate: value(practiceAttendanceRate),
    playersAtInjuryRisk: value(playersAtInjuryRisk),
    upcomingTournaments: value(upcomingTournaments),
    openLessonSlots: value(openLessonSlots),
    coachesPaidRate: value(coachesPaidRate),
    pendingHotelReservations: value(pendingHotelReservations),
    weather: value(weather) || { configured: false, alerts: [] },
  });
};

module.exports = { getDashboard };
