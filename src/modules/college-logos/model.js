const mongoose = require("mongoose");

// One logo per college, shared by every committed player at that school, so a
// logo is uploaded once and shows up for everyone (and for future commits).
// `key` is the college name reduced to lowercase letters and digits, so
// "Middlebury College" and "middlebury college " are the same school.
const collegeLogoSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports =
  mongoose.models.CollegeLogo || mongoose.model("CollegeLogo", collegeLogoSchema);
