const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.post("/", auth, requireRole("admin"), controller.createPayment);
router.get("/", auth, controller.listPayments);
router.patch("/:id", auth, requireRole("admin"), controller.updatePaymentStatus);

module.exports = router;
