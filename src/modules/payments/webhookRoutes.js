const router = require("express").Router();
const { getStripeClient } = require("./stripeClient");
const { processWebhookEvent } = require("./controller");

// Mounted in app.js with express.raw({ type: "application/json" }) BEFORE the
// global express.json() — Stripe signature verification needs the exact raw
// bytes it signed, not a parsed body. No auth/requireRole here: Stripe signs
// the request instead of sending a JWT.
router.post("/", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("❌ STRIPE_WEBHOOK_SECRET is not configured");
    return res.status(500).send("Webhook not configured");
  }

  let event;
  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await processWebhookEvent(event);
    return res.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook processing error:", err);
    return res.status(500).json({ message: "Webhook processing failed" });
  }
});

module.exports = router;
