const express = require("express");
const { getTeamMessages } = require("../controllers/messages");
const auth = require("../middlewares/auth");
const router = express.Router();

// GET chat history for a team
router.get("/:teamId", auth, getTeamMessages);

module.exports = router;
