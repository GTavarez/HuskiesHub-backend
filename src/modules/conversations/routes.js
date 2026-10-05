const express = require("express");
const controller = require("./controller");
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");

const router = express.Router();

router.post("/", auth, requireRole("coach", "admin"), controller.createConversation);
router.get("/", auth, controller.listMyConversations);

// Private messages. Registered before the "/:id" routes so "direct" and
// "dm-candidates" are never read as a conversation id.
router.get("/dm-candidates", auth, controller.listDirectMessageCandidates);
router.post("/direct", auth, controller.createDirectConversation);

router.get("/:id/messages", auth, controller.getConversationMessages);
router.patch("/:id", auth, controller.renameConversation);
router.post("/:id/members", auth, controller.addMembers);
router.delete("/:id/members/:userId", auth, controller.removeMember);

module.exports = router;
