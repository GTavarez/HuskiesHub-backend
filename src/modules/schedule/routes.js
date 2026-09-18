const express = require("express");
const { getSchedule, getScheduleIcs } = require("./controller");

const router = express.Router();

// GET /api/schedule
router.get("/schedule", getSchedule);

// GET /api/schedule/ics — public "subscribe by URL" feed for Apple/Google/
// Outlook calendar apps.
router.get("/schedule/ics", getScheduleIcs);

module.exports = router;
