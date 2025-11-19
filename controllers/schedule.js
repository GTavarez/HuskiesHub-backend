// controllers/schedule.js
const { google } = require("googleapis");
const path = require("path");
require("dotenv").config();

// ✅ Authenticate using Service Account (no popups, backend only)
const auth = new google.auth.GoogleAuth({
  keyFile: path.join(__dirname, "../secrets/huskieshub-f7165f06c11d.json"), // ✅ correct path
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"], // ✅ read-only
});

const calendar = google.calendar({ version: "v3", auth });

const getSchedule = async (req, res) => {
  try {
    /* await auth.authorize(); */ // ✅ auth server-side
    const authClient = await auth.getClient();

    const response = await calendar.events.list({
      calendarId: process.env.GOOGLE_CALENDAR_ID, // team calendar
      auth: authClient,
      timeMin: new Date("2024-01-01").toISOString(), // only upcoming games
      maxResults: 20,
      singleEvents: true,
      orderBy: "startTime",
    });

    res.status(200).json(response.data.items); // ✅ send events to frontend
  } catch (err) {
    console.error(
      "❌ Google Calendar API Error:",
      err.response?.data || err.message
    );
    res.status(500).json({ message: "Error fetching calendar events" });
  }
};

module.exports = { getSchedule };
