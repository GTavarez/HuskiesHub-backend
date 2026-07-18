const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/", auth, controller.listNotes);
router.post("/", auth, requireRole("admin", "coach"), controller.createNote);
router.delete("/:id", auth, requireRole("admin", "coach"), controller.deleteNote);

module.exports = router;
