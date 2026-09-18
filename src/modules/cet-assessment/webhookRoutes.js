const router = require("express").Router();
const { getCetStripeClient } = require("./stripeClient");
const { processWebhookEvent } = require("./controller");

// Mounted in app.js with express.raw({ type: "application/json" }) BEFORE the
// global express.json() — same reasoning as payments/webhookRoutes.js.
// Verified against CET's OWN webhook signing secret (separate Stripe
// account/webhook from the Huskies club's payments webhook).
router.post("/", async (req, res) => {
  const signature = req.headers["stripe-signature"];
  const webhookSecret = process.env.CET_STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("❌ CET_STRIPE_WEBHOOK_SECRET is not configured");
    return res.status(500).send("Webhook not configured");
  }

  let event;
  try {
    const stripe = getCetStripeClient();
    event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
  } catch (err) {
    console.error("CET Stripe webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    await processWebhookEvent(event);
    return res.json({ received: true });
  } catch (err) {
    console.error("CET Stripe webhook processing error:", err);
    return res.status(500).json({ message: "Webhook processing failed" });
  }
});

module.exports = router;
