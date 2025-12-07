// routes/schedule.js
const express = require("express");
const { getSchedule } = require("../controllers/schedule");

const router = express.Router();

console.log("🔵 schedule.js LOADED – defining /schedule route");

// GET /api/schedule
router.get("/schedule", getSchedule);

module.exports = router;
