const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.post("/checkout-session", auth, controller.createCheckoutSession);
router.post("/setup-session", auth, controller.createSetupSession);
router.post("/run-autopay", auth, requireRole("admin"), controller.runAutopay);
router.get("/balance", auth, controller.getBalance);
router.get("/history", auth, controller.getPaymentHistory);
router.post("/:id/refund", auth, requireRole("admin"), controller.refundPayment);
router.post("/send-reminders", auth, requireRole("admin"), controller.sendReminders);
router.get(
  "/export/quickbooks",
  auth,
  requireRole("admin"),
  controller.exportQuickbooksCsv
);

module.exports = router;
