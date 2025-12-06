// routes/schedule.js
const express = require("express");
const { getSchedule } = require("../controllers/schedule");

const router = express.Router();

router.get("/schedule", getSchedule);

module.exports = router;
