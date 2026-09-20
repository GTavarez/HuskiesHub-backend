const mongoose = require("mongoose");

// Track-only ledger — no money moves through this. Coaches are paid outside
// the app (Zelle, Venmo, check, bank transfer); this records what each coach
// is owed and, once handled, how and when they were paid. Stripe Connect
// payouts would need per-coach onboarding and identity verification, so they
// are a separate piece of work.
const PAYMENT_METHODS = ["zelle", "venmo", "cash_app", "check", "cash", "bank_transfer", "other"];

const coachPaymentSchema = new mongoose.Schema(
  {
    coachUserId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    payPeriodStart: { type: Date, required: true },
    payPeriodEnd: { type: Date, required: true },
    amountCents: { type: Number, required: true, min: 0 },
    note: { type: String, default: "", trim: true, maxlength: 500 },
    status: { type: String, enum: ["unpaid", "paid"], default: "unpaid" },
    paidAt: { type: Date, default: null },
    paidBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    method: { type: String, enum: [...PAYMENT_METHODS, ""], default: "" },
    reference: { type: String, default: "", trim: true, maxlength: 200 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

coachPaymentSchema.index({ coachUserId: 1, payPeriodStart: -1 });

const CoachPayment =
  mongoose.models.CoachPayment || mongoose.model("CoachPayment", coachPaymentSchema);

module.exports = CoachPayment;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
