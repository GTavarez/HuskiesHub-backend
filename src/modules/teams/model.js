const mongoose = require("mongoose");

const teamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    ageGroup: {
      type: String,
      required: true,
    },
    // Seeds a new Registration's fee/autopay for a player on this team —
    // see registrations/controller.js createRegistration.
    registrationFeeCents: { type: Number, default: 0, min: 0 },
    depositAmountCents: { type: Number, default: 0, min: 0 },
    // Fixed monthly amount for the season-balance autopay plan — set by admin
    // only. Parents can enroll but never choose or change this amount (the
    // whole point is there's no "defer/lower it" option).
    autopayAmountCents: { type: Number, default: 0, min: 0 },
    autopayDayOfMonth: { type: Number, min: 1, max: 28, default: 1 },
    // Number of monthly charges before autopay stops automatically (the
    // season-balance plan is a fixed installment count, not indefinite billing).
    autopayTotalInstallments: { type: Number, default: 8, min: 1 },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.Team || mongoose.model("Team", teamSchema);
