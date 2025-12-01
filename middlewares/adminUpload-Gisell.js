// middlewares/adminUpload.js
module.exports = function adminUpload(req, res, next) {
  const secret = process.env.ADMIN_UPLOAD_SECRET;

  if (!secret) {
    console.warn("⚠️ ADMIN_UPLOAD_SECRET is not set. Blocking admin upload.");
    return res
      .status(500)
      .json({ message: "Admin upload is not configured on the server." });
  }

  const header = req.headers["x-admin-secret"];

  if (!header || header !== secret) {
    return res
      .status(403)
      .json({ message: "Forbidden: invalid admin secret." });
  }

  next();
};
