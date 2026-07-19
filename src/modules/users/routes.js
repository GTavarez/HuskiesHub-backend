const router = require("express").Router();
const multer = require("multer");
const {
  signup,
  signin,
  getCurrentUser,
  updateUserProfile,
  uploadAvatar,
} = require("./controller");
const {
  requestCollegeCoachAccess,
  listPendingCollegeCoachRequests,
  approveCollegeCoach,
  rejectCollegeCoach,
} = require("./collegeCoachController");
const {
  submitRoleRequest,
  listPendingRoleRequests,
  approveRoleRequest,
  rejectRoleRequest,
} = require("./roleRequestController");
const auth = require("../../common/middlewares/auth");
const requireRole = require("../../common/middlewares/requireRole");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    return cb(null, true);
  },
});

router.post("/signup", signup);
router.post("/signin", signin);
router.get("/me", auth, getCurrentUser);
router.patch("/me", auth, updateUserProfile);
router.patch("/me/avatar", auth, upload.single("avatar"), uploadAvatar);

router.post("/college-coach/request", auth, requestCollegeCoachAccess);
router.get(
  "/admin/college-coach/pending",
  auth,
  requireRole("admin"),
  listPendingCollegeCoachRequests
);
router.patch(
  "/admin/college-coach/:userId/approve",
  auth,
  requireRole("admin"),
  approveCollegeCoach
);
router.patch(
  "/admin/college-coach/:userId/reject",
  auth,
  requireRole("admin"),
  rejectCollegeCoach
);

router.post("/role-request", auth, submitRoleRequest);
router.get(
  "/admin/role-requests/pending",
  auth,
  requireRole("admin"),
  listPendingRoleRequests
);
router.patch(
  "/admin/role-requests/:userId/approve",
  auth,
  requireRole("admin"),
  approveRoleRequest
);
router.patch(
  "/admin/role-requests/:userId/reject",
  auth,
  requireRole("admin"),
  rejectRoleRequest
);

module.exports = router;
