// controllers/schedule.js
const { google } = require("googleapis");
const path = require("path");
require("dotenv").config();

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, "../secrets/huskieshub-f7165f06c11d.json"),
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});

const calendar = google.calendar({ version: "v3", auth });

const getSchedule = async (req, res) => {
  try {
    const authClient = await auth.getClient();

    // ✅ FIX — Use CALENDAR_ID from Cloud Run
    const calendarId = process.env.CALENDAR_ID;

    if (!calendarId) {
      console.error("❌ CALENDAR_ID is missing from environment variables");
      return res.status(500).json({ message: "Missing calendar ID" });
    }

    const response = await calendar.events.list({
      calendarId,
      auth: authClient,
      maxResults: 50,
      singleEvents: true,
      orderBy: "startTime",
    });

    res.status(200).json(response.data.items);
  } catch (err) {
    console.error(
      "❌ Google Calendar API Error:",
      err.response?.data || err.message
    );
    res.status(500).json({ message: "Error fetching calendar events" });
  }
};

module.exports = { getSchedule };
