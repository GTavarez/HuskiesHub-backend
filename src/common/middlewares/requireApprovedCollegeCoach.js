// Deliberately checks BOTH role and collegeCoachStatus, not just
// requireRole("college_coach") — role and status should always agree in
// practice (role only flips at approval time, see
// modules/users/collegeCoachController.js), but this is cheap
// defense-in-depth against a future bug (bulk role edit, new admin UI, etc.)
// silently letting a pending applicant through.
module.exports = function requireApprovedCollegeCoach(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ message: "Authorization required" });
  }
  if (req.user.role !== "college_coach" || req.user.collegeCoachStatus !== "approved") {
    return res.status(403).json({ message: "Forbidden" });
  }
  return next();
};
