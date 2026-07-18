const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const hotelController = require("./hotelController");

router.get("/", auth, requireRole("admin"), hotelController.listPendingHotelReservations);
router.patch("/:id", auth, requireRole("admin"), hotelController.updateHotelReservationStatus);

module.exports = router;
