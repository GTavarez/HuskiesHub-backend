const Stripe = require("stripe");

// Deliberately a SEPARATE client/key from payments/stripeClient.js — CET
// runs on its own Stripe account (see CET-backend, which already uses
// CET_STRIPE_SECRET_KEY for the Academy/Remote subscriptions), kept
// separate from the Huskies club's own Stripe account/revenue.
let client = null;

function getCetStripeClient() {
  if (!client) {
    if (!process.env.CET_STRIPE_SECRET_KEY) {
      throw new Error("CET_STRIPE_SECRET_KEY is not configured");
    }
    client = new Stripe(process.env.CET_STRIPE_SECRET_KEY);
  }
  return client;
}

module.exports = { getCetStripeClient };
