const mongoose = require("mongoose");

const waiverSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    bodyText: { type: String, required: true },
    version: { type: Number, required: true },
    effectiveDate: { type: Date, required: true },
    // Only one waiver should be active at a time — enforced in the controller
    // (deactivate prior versions on create), not via a schema constraint.
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Waiver || mongoose.model("Waiver", waiverSchema);
