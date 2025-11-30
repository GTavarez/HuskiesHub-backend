// controllers/schedule.js
const { google } = require("googleapis");
require("dotenv").config();

// Initialize JWT client
const auth = new google.auth.JWT({
  email: process.env.GOOGLE_CLIENT_EMAIL,
  key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  scopes: ["https://www.googleapis.com/auth/calendar.readonly"],
});

// Calendar API instance
const calendar = google.calendar({
  version: "v3",
  auth, // <-- JWT is the client
});

const getSchedule = async (req, res) => {
  try {
    const calendarId = process.env.CALENDAR_ID;

    if (!calendarId) {
      console.error("❌ CALENDAR_ID missing");
      return res.status(500).json({ message: "Missing CALENDAR_ID" });
    }

    // Fetch ALL events (past + future)
    const response = await calendar.events.list({
      calendarId,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 2500,
      showDeleted: false,
    });

    const events = response.data.items || [];

    const cleanedEvents = events
      .map((e) => ({
        id: e.id,
        title: e.summary || "Untitled Event",
        location: e.location || "",
        description: e.description || "",
        start: e.start?.dateTime || e.start?.date,
        end: e.end?.dateTime || e.end?.date,
      }))
      .filter((e) => e.start)
      .sort((a, b) => new Date(a.start) - new Date(b.start));

    res.status(200).json(cleanedEvents);
  } catch (err) {
    console.error(
      "❌ Google Calendar Error:",
      err.response?.data || err.message
    );
    res.status(500).json({ message: "Google Calendar error" });
  }
};

module.exports = { getSchedule };
