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
    autopayAmountCents: { type: Number, default: 0, min: 0 },
    autopayDayOfMonth: { type: Number, min: 1, max: 28, default: 1 },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.models.Team || mongoose.model("Team", teamSchema);
