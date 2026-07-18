const express = require("express");
const { getSchedule } = require("./controller");

const router = express.Router();

// GET /api/schedule
router.get("/schedule", getSchedule);

module.exports = router;
