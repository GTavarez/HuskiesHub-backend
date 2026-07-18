const mongoose = require("mongoose");

const registrationSchema = new mongoose.Schema(
  {
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: "Player", required: true },
    teamId: { type: mongoose.Schema.Types.ObjectId, ref: "Team", required: true },
    season: { type: String, required: true },
    status: {
      type: String,
      enum: ["pending", "active", "withdrawn", "completed"],
      default: "pending",
    },
    registrationFeeCents: { type: Number, required: true, min: 0 },
    depositAmountCents: { type: Number, default: 0, min: 0 },
    depositPaidAt: { type: Date, default: null },
    autopayEnabled: { type: Boolean, default: false },
    autopayAmountCents: { type: Number, default: 0, min: 0 },
    // Capped at 28 to sidestep month-length edge cases (Feb, 30-day months).
    autopayDayOfMonth: { type: Number, min: 1, max: 28, default: 1 },
    // Whose saved Stripe payment method to charge for this registration's autopay —
    // set when the setup-mode Checkout session completes (see payments/controller.js).
    billingUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    waiverSignatureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WaiverSignature",
      default: null,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

registrationSchema.index({ playerId: 1, season: 1 }, { unique: true });

module.exports =
  mongoose.models.Registration || mongoose.model("Registration", registrationSchema);
