const router = require("express").Router();
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");
const controller = require("./controller");

router.get("/", controller.listProducts);
router.get("/:id", controller.getProduct);
router.post("/", auth, requireRole("admin"), controller.createProduct);
router.patch("/:id", auth, requireRole("admin"), controller.updateProduct);
router.delete("/:id", auth, requireRole("admin"), controller.deactivateProduct);

module.exports = router;
