const mongoose = require("mongoose");
const AssessmentEvent = require("./eventModel");
const CetRegistration = require("./model");
const { getCetStripeClient } = require("./stripeClient");
const { upsertBrevoContact } = require("../../common/utils/brevo");

// ---- Event (the "which assessment day" config) ---------------------------

/**
 * GET /api/cet-assessment/current-event
 * Public. The registration forms read this instead of hardcoding a date —
 * setting up the next assessment day is a new event record, not a redeploy.
 */
const getCurrentEvent = async (req, res) => {
  try {
    const event = await AssessmentEvent.findOne({ active: true }).sort({ createdAt: -1 });
    if (!event) return res.status(404).json({ message: "No active assessment event" });
    return res.json(event);
  } catch (err) {
    console.error("Get current CET assessment event error:", err);
    return res.status(500).json({ message: "Failed to fetch current event" });
  }
};

/**
 * POST /api/cet-assessment/events
 * Admin-only. Deactivates any currently-active event and creates the new
 * one — this is how the next assessment day (October, winter testing, a
 * clinic, ...) gets set up.
 */
const createEvent = async (req, res) => {
  const { name, date, location, publicFeeCents } = req.body;
  if (!name || !date) {
    return res.status(400).json({ message: "name and date are required" });
  }

  try {
    await AssessmentEvent.updateMany({ active: true }, { active: false });
    const event = await AssessmentEvent.create({
      name,
      date: new Date(date),
      location: location || "",
      publicFeeCents: publicFeeCents ?? 2000,
      active: true,
    });
    return res.status(201).json(event);
  } catch (err) {
    console.error("Create CET assessment event error:", err);
    return res.status(400).json({ message: err.message });
  }
};

// ---- Brevo sync ------------------------------------------------------------

function brevoAttributesFor(registration) {
  return {
    FIRSTNAME: registration.parentFirstName,
    LASTNAME: registration.parentLastName,
    SMS: registration.parentPhone || undefined,
    ATHLETE_FIRST: registration.athleteFirstName,
    ATHLETE_LAST: registration.athleteLastName,
    ATHLETE_GRADE: registration.athleteGrade || "",
    ATHLETE_AGE: registration.athleteAge || undefined,
    TEAM: registration.currentTeamOrg || "",
    POSITION: registration.primaryPosition || "",
    PITCHER: registration.isPitcher ? "Yes" : "No",
    SOURCE: registration.leadSource,
    REG_TYPE: registration.registrationType === "huskies" ? "Huskies" : "Public",
    EVENT: registration.eventName,
    PAYMENT_STATUS:
      { free: "Free", pay_later: "Pay Later", pending: "Pending", paid: "Paid" }[
        registration.paymentStatus
      ] || registration.paymentStatus,
    ASSESSMENT_REGISTERED: "Yes",
  };
}

// Returns whether the sync succeeded — callers own updating/saving their own
// local `registration` reference, so this never mutates a passed-in doc.
async function syncRegistrationToBrevo(registration) {
  return upsertBrevoContact({
    email: registration.parentEmail,
    attributes: brevoAttributesFor(registration),
  });
}

async function syncAndMarkSynced(registration) {
  const synced = await syncRegistrationToBrevo(registration);
  if (!synced) return;
  const doc = await CetRegistration.findById(registration._id);
  if (!doc) return;
  doc.brevoSyncedAt = new Date();
  await doc.save();
}

// ---- Registration ----------------------------------------------------------

const REQUIRED_FIELDS = [
  "parentFirstName",
  "parentLastName",
  "parentEmail",
  "athleteFirstName",
  "athleteLastName",
];

/**
 * POST /api/cet-assessment/register
 * Public — no auth for either path. `registrationType` is "public" or
 * "huskies"; Huskies registrations are always free (no Stripe involved at
 * all). Public registrations start as "pending" if paying online (the
 * webhook flips it to "paid") or "pay_later" if choosing cash/pay-later —
 * either way the registration itself is already complete.
 */
const register = async (req, res) => {
  const { registrationType, payOnline } = req.body;

  if (!["public", "huskies"].includes(registrationType)) {
    return res.status(400).json({ message: "Invalid registrationType" });
  }
  const missingField = REQUIRED_FIELDS.find((field) => !req.body[field]);
  if (missingField) {
    return res.status(400).json({ message: `${missingField} is required` });
  }
  if (!req.body.waiverAgreed) {
    return res.status(400).json({ message: "Waiver agreement is required" });
  }

  try {
    const event = await AssessmentEvent.findOne({ active: true }).sort({ createdAt: -1 });
    if (!event) {
      return res.status(400).json({ message: "No active assessment event to register for" });
    }

    const isHuskies = registrationType === "huskies";
    const feeCents = isHuskies ? 0 : event.publicFeeCents;
    let paymentStatus = "pay_later";
    if (isHuskies) paymentStatus = "free";
    else if (payOnline) paymentStatus = "pending";

    const registration = await CetRegistration.create({
      registrationType,
      eventId: event._id,
      eventName: event.name,
      eventDate: event.date,
      eventLocation: event.location,
      parentFirstName: req.body.parentFirstName,
      parentLastName: req.body.parentLastName,
      parentEmail: req.body.parentEmail,
      parentPhone: req.body.parentPhone || "",
      athleteFirstName: req.body.athleteFirstName,
      athleteLastName: req.body.athleteLastName,
      athleteAge: req.body.athleteAge || undefined,
      athleteGrade: req.body.athleteGrade || "",
      currentTeamOrg: req.body.currentTeamOrg || "",
      primaryPosition: req.body.primaryPosition || "",
      isPitcher: Boolean(req.body.isPitcher),
      waiverAgreed: true,
      marketingConsent: req.body.marketingConsent !== false,
      leadSource: isHuskies ? "Huskies Performance Assessment" : "Performance Assessment",
      paymentStatus,
      feeCents,
    });

    // Best-effort, never blocks the registration itself.
    syncAndMarkSynced(registration).catch((err) =>
      console.warn("Brevo sync (register) failed:", err.message)
    );

    return res.status(201).json({
      registration,
      needsPayment: !isHuskies && Boolean(payOnline),
    });
  } catch (err) {
    console.error("CET assessment register error:", err);
    return res.status(500).json({ message: "Failed to register" });
  }
};

/**
 * POST /api/cet-assessment/:id/checkout
 * Public. Creates a one-time $20 Stripe Checkout session (CET's own Stripe
 * account) for a "pending" public registration that chose to pay online.
 */
const createCheckout = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid registration id" });
  }

  try {
    const registration = await CetRegistration.findById(id);
    if (!registration) return res.status(404).json({ message: "Registration not found" });
    if (registration.registrationType !== "public") {
      return res.status(400).json({ message: "Huskies registrations don't require payment" });
    }
    if (!registration.feeCents) {
      return res.status(400).json({ message: "Nothing due for this registration" });
    }

    const stripe = getCetStripeClient();
    const frontendUrl = process.env.FRONTEND_URL;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: registration.parentEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: registration.feeCents,
            product_data: { name: `${registration.eventName} — Registration Fee` },
          },
          quantity: 1,
        },
      ],
      success_url: `${frontendUrl}/competitive-edge-training/performance-assessment/confirmation?registrationId=${registration._id}`,
      cancel_url: `${frontendUrl}/competitive-edge-training/performance-assessment/confirmation?registrationId=${registration._id}&payment=cancelled`,
      metadata: { registrationId: registration._id.toString() },
    });

    registration.stripeCheckoutSessionId = session.id;
    await registration.save();

    return res.status(201).json({ url: session.url });
  } catch (err) {
    console.error("CET assessment checkout error:", err);
    return res.status(500).json({ message: err.message || "Failed to start checkout" });
  }
};

/**
 * GET /api/cet-assessment/:id
 * Public — the confirmation page reads registration + payment status back
 * after redirecting from Stripe (or immediately, for pay-later/Huskies).
 */
const getRegistration = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid registration id" });
  }
  try {
    const registration = await CetRegistration.findById(id);
    if (!registration) return res.status(404).json({ message: "Registration not found" });
    return res.json(registration);
  } catch (err) {
    console.error("Get CET registration error:", err);
    return res.status(500).json({ message: "Failed to fetch registration" });
  }
};

/**
 * GET /api/cet-assessment/registrations
 * Admin-only — a plain list until there's time for a dedicated admin panel.
 */
const listRegistrations = async (req, res) => {
  try {
    const registrations = await CetRegistration.find({}).sort({ createdAt: -1 });
    return res.json(registrations);
  } catch (err) {
    console.error("List CET registrations error:", err);
    return res.status(500).json({ message: "Failed to fetch registrations" });
  }
};

// ---- Webhook (Stripe → payment confirmed) ----------------------------------

async function handleCheckoutSessionCompleted(session) {
  const registrationId = session.metadata?.registrationId;
  if (!registrationId) return;

  const registration = await CetRegistration.findById(registrationId);
  if (!registration) return;

  registration.paymentStatus = "paid";
  registration.stripePaymentIntentId = session.payment_intent || registration.stripePaymentIntentId;
  await registration.save();

  syncAndMarkSynced(registration).catch((err) =>
    console.warn("Brevo sync (payment confirmed) failed:", err.message)
  );
}

const EVENT_HANDLERS = {
  "checkout.session.completed": (event) => handleCheckoutSessionCompleted(event.data.object),
};

const processWebhookEvent = async (event) => {
  const handler = EVENT_HANDLERS[event.type];
  if (handler) await handler(event);
};

module.exports = {
  getCurrentEvent,
  createEvent,
  register,
  createCheckout,
  getRegistration,
  listRegistrations,
  processWebhookEvent,
};
