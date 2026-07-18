const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/", auth, controller.listTournaments);
router.get("/:id", auth, controller.getTournament);
router.post("/", auth, requireRole("admin"), controller.createTournament);
router.patch("/:id", auth, requireRole("admin"), controller.updateTournament);
router.post(
  "/:id/hotel-reservations",
  auth,
  requireRole("admin"),
  controller.createHotelReservation
);
router.get("/:id/hotel-reservations", auth, controller.listHotelReservationsForTournament);

module.exports = router;
