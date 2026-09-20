const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/", auth, requireRole("admin", "coach"), controller.listOptions);
router.delete("/:id", auth, requireRole("admin"), controller.deleteOption);

module.exports = router;
