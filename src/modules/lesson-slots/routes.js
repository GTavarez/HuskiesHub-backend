const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/", auth, controller.listSlots);
router.post("/", auth, requireRole("admin", "coach"), controller.createSlot);
router.patch("/:id", auth, requireRole("admin", "coach"), controller.updateSlot);
router.delete("/:id", auth, requireRole("admin", "coach"), controller.deleteSlot);

module.exports = router;
