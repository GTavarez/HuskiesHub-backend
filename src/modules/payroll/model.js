const mongoose = require("mongoose");

// Ledger of what each coach is owed and how and when they were paid. Most
// payments are handled outside the app (Zelle, Venmo, check, bank transfer)
// and marked paid by hand. A coach who has finished Stripe Connect onboarding
// can instead be paid with the admin's "Pay with Stripe" action (see
// connectController.js), which records the transfer id as the reference.
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
    // "stripe" is set only by the Stripe payout endpoint, never by hand.
    method: { type: String, enum: [...PAYMENT_METHODS, "stripe", ""], default: "" },
    stripeTransferId: { type: String, default: null },
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
