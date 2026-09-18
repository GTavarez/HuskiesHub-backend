const express = require("express");
const controller = require("./controller");
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");

const router = express.Router();

router.post("/", auth, requireRole("coach", "admin"), controller.createConversation);
router.get("/", auth, controller.listMyConversations);
router.get("/:id/messages", auth, controller.getConversationMessages);

module.exports = router;
