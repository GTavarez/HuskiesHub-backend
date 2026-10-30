// What a charge.refunded event should change on a payment record. Kept free of
// database code so it can be tested on its own.

// current:  { refundedAmountCents, refundedAt } as already stored on the payment
// returns:  the fields to save, or null when the record already shows this refund
function refundUpdate({ amountRefundedCents, amountCents, eventCreated, current = {} }) {
  // An admin refund through the app is written straight away, so the webhook
  // that follows must not change its date. Same total means nothing to do.
  if ((current.refundedAmountCents || 0) === amountRefundedCents && current.refundedAt) return null;

  return {
    refundedAmountCents: amountRefundedCents,
    // The day Stripe says the refund happened, not the day we heard about it, so a
    // refund made in the Stripe dashboard lands on the right date in the books.
    refundedAt: eventCreated ? new Date(eventCreated * 1000) : new Date(),
    // Only a full refund closes the payment. A partial one leaves it open so the
    // rest can still be refunded later.
    status: amountRefundedCents >= amountCents ? "refunded" : "succeeded",
  };
}

module.exports = { refundUpdate };
