// controllers/schedule.js
const { google } = require("googleapis");
require("dotenv").config();

// --- Service Account Auth (Environment Variables) ---
const jwtClient = new google.auth.JWT(
  process.env.GOOGLE_CLIENT_EMAIL,
  null,
  process.env.GOOGLE_PRIVATE_KEY
    ? process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n")
    : undefined,
  ["https://www.googleapis.com/auth/calendar.readonly"]
);

const calendar = google.calendar({ version: "v3", auth: jwtClient });

// --- MAIN CONTROLLER ---
const getSchedule = async (req, res) => {
  try {
    const calendarId = process.env.CALENDAR_ID;
    if (!calendarId) {
      console.error("❌ Missing CALENDAR_ID from env");
      return res.status(500).json({ message: "Missing calendar ID" });
    }

    // 🔥 The ONLY place where await is allowed
    const { data } = await calendar.events.list({
      calendarId,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 100,
      timeMin: "2000-01-01T00:00:00.000Z",
    });

    const events = (data.items || []).map((event) => {
      const start =
        event.start?.dateTime || event.start?.date || null;

      const end =
        event.end?.dateTime || event.end?.date || null;

      return {
        id: event.id,
        title: event.summary || "TBD",
        start,
        end,
        location: event.location || "Location TBA",
      };
    });

    return res.status(200).json(events);
  } catch (err) {
    console.error(
      "❌ Google Calendar API Error:",
      err.response?.data || err.message
    );
    return res.status(500).json({ message: "Google Calendar error" });
  }
};

module.exports = { getSchedule };
