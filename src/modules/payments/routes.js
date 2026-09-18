const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

// Coaches don't get financial visibility or the ability to trigger a
// charge — payments stay admin/family-only, same boundary as registrations.
router.post(
  "/checkout-session",
  auth,
  requireRole("admin", "parent", "player"),
  controller.createCheckoutSession
);
router.post(
  "/setup-session",
  auth,
  requireRole("admin", "parent", "player"),
  controller.createSetupSession
);
router.post("/run-autopay", auth, requireRole("admin"), controller.runAutopay);
// No user auth — called by Cloud Scheduler, authenticated via CRON_SECRET
// header inside the handler itself.
router.post("/run-autopay-cron", controller.runAutopayCron);
router.get("/balance", auth, requireRole("admin", "parent", "player"), controller.getBalance);
router.get(
  "/history",
  auth,
  requireRole("admin", "parent", "player"),
  controller.getPaymentHistory
);
router.post("/:id/refund", auth, requireRole("admin"), controller.refundPayment);
router.post("/send-reminders", auth, requireRole("admin"), controller.sendReminders);
router.get(
  "/export/quickbooks",
  auth,
  requireRole("admin"),
  controller.exportQuickbooksCsv
);
// Admin-only lookup of the standalone Fall/Winter Payment Link — kept out of
// the public site (owner asked it not be posted publicly) but discoverable
// in the admin dashboard instead of living only in chat history.
router.get(
  "/fall-winter-link",
  auth,
  requireRole("admin"),
  controller.getFallWinterPaymentLink
);

module.exports = router;
