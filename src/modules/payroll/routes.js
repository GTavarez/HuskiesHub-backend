const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");
const connect = require("./connectController");

router.get("/payees", auth, requireRole("admin"), controller.listPayees);

// Stripe Connect payouts. Registered before the "/:id" routes below.
router.get("/connect/platform", auth, requireRole("admin"), connect.getPlatform);
router.get("/connect/coaches", auth, requireRole("admin"), connect.listCoachConnect);
router.get("/connect/me", auth, requireRole("coach"), connect.getMyConnect);
router.post("/connect/onboard", auth, requireRole("coach"), connect.startOnboarding);
router.post("/:id/stripe-payout", auth, requireRole("admin"), connect.payWithStripe);

router.post("/", auth, requireRole("admin"), controller.createPayment);
router.get("/", auth, controller.listPayments);
router.patch("/:id", auth, requireRole("admin"), controller.updatePaymentStatus);
router.delete("/:id", auth, requireRole("admin"), controller.deletePayment);

module.exports = router;
