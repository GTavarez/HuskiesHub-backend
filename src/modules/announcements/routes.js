const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/", auth, controller.listAnnouncements);
router.post("/", auth, requireRole("admin", "coach"), controller.createAnnouncement);
router.delete("/:id", auth, requireRole("admin", "coach"), controller.deleteAnnouncement);

module.exports = router;
