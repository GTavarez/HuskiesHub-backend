const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});

const calendar = google.calendar({ version: "v3", auth });

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

    res.json(response.data.items || []);
  } catch (err) {
    console.error("❌ Google Calendar API Error:", err);
    res.status(500).json({ message: "Error fetching calendar events" });
  }
};

module.exports = { getSchedule };
