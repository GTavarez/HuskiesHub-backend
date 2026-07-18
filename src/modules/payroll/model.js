const mongoose = require("mongoose");

// Track-only ledger — no money moves through this. Actually paying coaches
// happens off-platform (check/Venmo/payroll provider); this just records
// whether that happened. Deliberately not wired to Stripe — paying out to
// individuals would need Stripe Connect (per-coach onboarding, identity
// verification, 1099s), a materially bigger compliance surface than Phase 2's
// collection-only payment flow, and out of scope for this pass.
const coachPaymentSchema = new mongoose.Schema(
  {
    coachUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    payPeriodStart: { type: Date, required: true },
    payPeriodEnd: { type: Date, required: true },
    amountCents: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["unpaid", "paid"], default: "unpaid" },
    paidAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

coachPaymentSchema.index({ coachUserId: 1, payPeriodStart: -1 });

module.exports =
  mongoose.models.CoachPayment || mongoose.model("CoachPayment", coachPaymentSchema);
