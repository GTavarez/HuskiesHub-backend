const express = require("express");
const controller = require("./controller");
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");

const router = express.Router();

router.get("/summary", auth, controller.getSummary);
router.get("/room", auth, controller.getRoomInfo);
router.post("/read", auth, controller.markRead);
router.post("/mute", auth, controller.muteRoom);
router.get("/members", auth, controller.listMembers);
router.get("/seen", auth, controller.getSeenBy);
router.get("/pinned", auth, controller.listPinned);
router.patch("/settings", auth, controller.updateSettings);

// Reports on messages, reviewed by admins.
router.get("/reports", auth, requireRole("admin"), controller.listReports);
router.post("/reports/:id/resolve", auth, requireRole("admin"), controller.resolveReport);

// Notifications to this person's phone or browser.
router.get("/push/public-key", auth, controller.getPushKey);
router.post("/push/subscribe", auth, controller.subscribePush);
router.post("/push/unsubscribe", auth, controller.unsubscribePush);
router.get("/push/status", auth, controller.pushStatus);
router.post("/push/test", auth, controller.sendTestPush);

module.exports = router;
