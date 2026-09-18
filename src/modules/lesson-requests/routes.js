const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

// Public — no auth. Parents browse/request without an account.
router.get("/open-slots", controller.listOpenSlots);
router.get("/schedule", controller.listScheduleOverview);
router.post("/", controller.createRequest);

// Public, token-authenticated — the confirm/decline landing page (see plan
// for why this is a read summary + separate POST, not a bare GET-mutates
// link: email link-prescanners could otherwise burn the single-use token).
router.get("/action", controller.getActionSummary);
router.post("/action", controller.applyAction);

// Admin dashboard.
router.get("/", auth, requireRole("admin"), controller.listAll);
router.patch("/:id/confirm", auth, requireRole("admin"), controller.confirmRequest);
router.patch("/:id/decline", auth, requireRole("admin"), controller.declineRequest);
router.patch(
  "/:id/payment-status",
  auth,
  requireRole("admin"),
  controller.updatePaymentStatus
);

// Admin — define/edit/remove the recurring weekly slots that exist in the
// first place (replaces manually adding a row to the Sheet).
router.post("/slots", auth, requireRole("admin"), controller.createSlot);
router.patch("/slots/:id", auth, requireRole("admin"), controller.updateSlot);
router.delete("/slots/:id", auth, requireRole("admin"), controller.deleteSlot);

module.exports = router;
