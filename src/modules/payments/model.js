const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["registration", "deposit", "autopay", "camp", "lesson", "apparel"],
      required: true,
    },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    amountCents: { type: Number, required: true },
    currency: { type: String, default: "usd" },
    stripeCheckoutSessionId: { type: String, default: null },
    stripePaymentIntentId: { type: String, default: null },
    status: {
      type: String,
      enum: ["pending", "succeeded", "failed", "refunded"],
      default: "pending",
    },
    description: { type: String, default: "" },
    relatedRegistrationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Registration",
      default: null,
    },
    relatedProductId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      default: null,
    },
    // Only meaningful for type:"lesson" — see lesson-slots module. The slot's
    // bookedCount is incremented atomically once this payment succeeds (see
    // handleCheckoutSessionCompleted), never optimistically at checkout time.
    lessonSlotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LessonSlot",
      default: null,
    },
    // Only set for type: "autopay", e.g. "2026-03" — the double-charge guard below
    // relies on this plus relatedRegistrationId being unique per billing period.
    billingPeriod: { type: String, default: null },
    refundedAmountCents: { type: Number, default: 0 },
    refundedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ userId: 1, createdAt: -1 });
paymentSchema.index(
  { relatedRegistrationId: 1, billingPeriod: 1 },
  { unique: true, partialFilterExpression: { type: "autopay" } }
);

module.exports = mongoose.models.Payment || mongoose.model("Payment", paymentSchema);
