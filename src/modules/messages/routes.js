const express = require("express");
const { getTeamMessages, runChatDigestCron } = require("./controller");
const auth = require("../../common/middlewares/auth");

const router = express.Router();

// No user auth — called by Cloud Scheduler, authenticated via CRON_SECRET
// header inside the handler itself.
router.post("/run-chat-digest-cron", runChatDigestCron);

// GET chat history for a team
router.get("/:teamId", auth, getTeamMessages);

module.exports = router;
