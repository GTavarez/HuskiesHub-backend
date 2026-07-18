const express = require("express");
const { getTeamMessages } = require("./controller");
const auth = require("../../common/middlewares/auth");

const router = express.Router();

// GET chat history for a team
router.get("/:teamId", auth, getTeamMessages);

module.exports = router;
