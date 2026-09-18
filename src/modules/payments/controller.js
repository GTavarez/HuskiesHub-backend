const mongoose = require("mongoose");
const { getStripeClient } = require("./stripeClient");
const Payment = require("./model");
const ProcessedStripeEvent = require("./processedStripeEvent.model");
const Registration = require("../registrations/model");
const Product = require("../products/model");
const LessonSlot = require("../lesson-slots/model");
const User = require("../users/model");
const Player = require("../players/model");
const Waiver = require("../waivers/model");
const WaiverSignature = require("../waiver-signatures/model");
const { canAccessPlayer } = require("../../common/utils/ownership");
const { getTransporter } = require("../../common/utils/mailer");

const TYPES_REQUIRING_REGISTRATION = ["registration", "deposit", "partialRegistration"];
const TYPES_REQUIRING_PRODUCT = ["camp", "lesson", "apparel"];

async function ensureStripeCustomer(user) {
  const stripe = getStripeClient();

  if (user.stripeCustomerId) {
    // A stored customer ID from Stripe test mode doesn't exist once the app
    // switches to live keys (test/live are entirely separate Stripe
    // environments) — verify it's actually valid before trusting it, rather
    // than failing every checkout for anyone with a pre-switch test ID.
    try {
      await stripe.customers.retrieve(user.stripeCustomerId);
      return user.stripeCustomerId;
    } catch (err) {
      if (err.code !== "resource_missing") throw err;
    }
  }

  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user._id.toString() },
  });

  await User.findByIdAndUpdate(user._id, { stripeCustomerId: customer.id });
  return customer.id;
}

async function computeRegistrationBalance(registration) {
  const paidAgg = await Payment.aggregate([
    {
      $match: {
        relatedRegistrationId: registration._id,
        type: { $in: ["registration", "deposit", "partialRegistration"] },
        status: "succeeded",
      },
    },
    { $group: { _id: null, total: { $sum: "$amountCents" } } },
  ]);
  const paidCents = paidAgg[0]?.total || 0;

  return {
    registrationId: registration._id,
    season: registration.season,
    registrationFeeCents: registration.registrationFeeCents,
    paidCents,
    balanceCents: Math.max(registration.registrationFeeCents - paidCents, 0),
  };
}

// ---- Checkout session creation ----------------------------------------

const createCheckoutSession = async (req, res) => {
  const { type, productId, registrationId, lessonSlotId, amountCents: requestedAmountCents } = req.body;

  if (![...TYPES_REQUIRING_REGISTRATION, ...TYPES_REQUIRING_PRODUCT].includes(type)) {
    return res.status(400).json({ message: "Invalid payment type" });
  }

  try {
    let amountCents;
    let description;
    let relatedRegistrationId = null;
    let relatedProductId = null;
    let bookedSlotId = null;

    if (TYPES_REQUIRING_REGISTRATION.includes(type)) {
      if (!registrationId || !mongoose.Types.ObjectId.isValid(registrationId)) {
        return res.status(400).json({ message: "Valid registrationId is required" });
      }
      const registration = await Registration.findById(registrationId);
      if (!registration) {
        return res.status(404).json({ message: "Registration not found" });
      }
      if (!canAccessPlayer(req.user, registration.playerId)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Registration/deposit payments require a signed liability waiver first.
      // Autopay's recurring off-session charges never go through this
      // function, so gating here is sufficient — by the time autopay runs,
      // the waiver was already required at initial registration/deposit.
      const activeWaiver = await Waiver.findOne({ active: true });
      if (activeWaiver) {
        const signature = await WaiverSignature.findOne({
          waiverId: activeWaiver._id,
          playerId: registration.playerId,
        });
        if (!signature) {
          return res.status(400).json({
            message: "Please sign the liability waiver before paying the registration fee",
          });
        }
        if (!registration.waiverSignatureId) {
          registration.waiverSignatureId = signature._id;
          await registration.save();
        }
      }

      if (type === "partialRegistration") {
        // A family paying down their balance in irregular, self-chosen
        // amounts (not the fixed registration fee, and not the fixed
        // monthly autopay installment) — e.g. "$800 this week, the rest
        // whenever I can." Capped at what's actually still owed so this
        // can never overpay past the registration fee.
        const { balanceCents } = await computeRegistrationBalance(registration);
        const requested = Math.round(Number(requestedAmountCents));
        if (!Number.isFinite(requested) || requested <= 0) {
          return res.status(400).json({ message: "A valid amountCents is required" });
        }
        if (requested > balanceCents) {
          return res.status(400).json({
            message: `That's more than the remaining balance ($${(balanceCents / 100).toFixed(2)}).`,
          });
        }
        amountCents = requested;
      } else {
        amountCents = type === "deposit" ? registration.depositAmountCents : registration.registrationFeeCents;
      }
      description =
        type === "partialRegistration" ? `Partial payment — ${registration.season}` : `${type} — ${registration.season}`;
      relatedRegistrationId = registration._id;
    } else {
      if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
        return res.status(400).json({ message: "Valid productId is required" });
      }
      const product = await Product.findById(productId);
      if (!product || !product.active) {
        return res.status(404).json({ message: "Product not found" });
      }

      amountCents = product.priceCents;
      description = product.name;
      relatedProductId = product._id;

      if (type === "lesson" && lessonSlotId) {
        if (!mongoose.Types.ObjectId.isValid(lessonSlotId)) {
          return res.status(400).json({ message: "Invalid lessonSlotId" });
        }
        const slot = await LessonSlot.findById(lessonSlotId);
        if (!slot) {
          return res.status(404).json({ message: "Lesson slot not found" });
        }
        if (slot.startsAt <= new Date()) {
          return res.status(400).json({ message: "This lesson slot has already passed" });
        }
        if (slot.bookedCount >= slot.capacity) {
          return res.status(409).json({ message: "This lesson slot is full" });
        }
        bookedSlotId = slot._id;
      }
    }

    if (!amountCents || amountCents <= 0) {
      return res.status(400).json({ message: "Nothing due for this item" });
    }

    const stripe = getStripeClient();
    const customerId = await ensureStripeCustomer(req.user);
    const frontendUrl = process.env.FRONTEND_URL;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer: customerId,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: { name: description },
          },
          quantity: 1,
        },
      ],
      // Registration fee payments also save the card for the season-balance
      // autopay plan — one checkout instead of asking the parent to enter
      // their card a second time. See handleCheckoutSessionCompleted below,
      // which enrolls autopay once this succeeds.
      ...(type === "registration"
        ? { payment_intent_data: { setup_future_usage: "off_session" } }
        : {}),
      success_url: `${frontendUrl}/payments/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/payments/cancel`,
      metadata: {
        userId: req.user._id.toString(),
        type,
        relatedRegistrationId: relatedRegistrationId ? relatedRegistrationId.toString() : "",
        relatedProductId: relatedProductId ? relatedProductId.toString() : "",
        lessonSlotId: bookedSlotId ? bookedSlotId.toString() : "",
      },
    });

    await Payment.create({
      type,
      userId: req.user._id,
      amountCents,
      stripeCheckoutSessionId: session.id,
      description,
      relatedRegistrationId,
      relatedProductId,
      lessonSlotId: bookedSlotId,
    });

    return res.status(201).json({ url: session.url });
  } catch (err) {
    console.error("Create checkout session error:", err);
    return res.status(500).json({ message: err.message || "Failed to create checkout session" });
  }
};

// ---- Setup session creation (save a card for autopay) ------------------

const createSetupSession = async (req, res) => {
  const { registrationId } = req.body;

  if (!registrationId || !mongoose.Types.ObjectId.isValid(registrationId)) {
    return res.status(400).json({ message: "Valid registrationId is required" });
  }

  try {
    const registration = await Registration.findById(registrationId);
    if (!registration) {
      return res.status(404).json({ message: "Registration not found" });
    }
    if (!canAccessPlayer(req.user, registration.playerId)) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const stripe = getStripeClient();
    const customerId = await ensureStripeCustomer(req.user);
    const frontendUrl = process.env.FRONTEND_URL;

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      payment_method_types: ["card"],
      customer: customerId,
      success_url: `${frontendUrl}/payments/success?setup=1`,
      cancel_url: `${frontendUrl}/payments/cancel`,
      metadata: {
        userId: req.user._id.toString(),
        registrationId: registration._id.toString(),
      },
    });

    return res.status(201).json({ url: session.url });
  } catch (err) {
    console.error("Create setup session error:", err);
    return res.status(500).json({ message: err.message || "Failed to create setup session" });
  }
};

// Sent once, right when a registration fee payment succeeds — the club's
// "welcome new family" touchpoint. A best-effort send (like the other
// notification emails in this codebase): failure here never blocks the
// webhook or the registration itself from completing.
async function sendWelcomeEmail(user, registration) {
  try {
    const player = await Player.findById(registration.playerId);
    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
    const playerName = player?.name || "your player";
    const monthlyAmount = (registration.autopayAmountCents / 100).toFixed(2);

    await transporter.sendMail({
      from: fromEmail,
      to: user.email,
      subject: "Welcome to the Empire State Huskies!",
      text: [
        `Hi ${user.name},`,
        "",
        `Thanks for registering ${playerName} for the ${registration.season} season — welcome to the Huskies family!`,
        "",
        "What happens next:",
        `- Your registration fee has been received.`,
        `- You're enrolled in the monthly payment plan: $${monthlyAmount}/month for ${registration.autopayTotalInstallments} months, automatically charged to the card on file.`,
        "- Log in to your Parent Portal any time to check your balance, payment history, schedule, and team chat.",
        "",
        "If you have any questions, just reply to this email.",
        "",
        "Welcome to the team!",
        "— Empire State Huskies Coaching Staff",
      ].join("\n"),
    });
  } catch (err) {
    console.warn("Welcome email not sent:", err.message);
  }
}

const FALL_WINTER_SEASON = "Fall/Winter 2026";

function extractCustomFieldValue(session, key) {
  const field = (session.custom_fields || []).find((f) => f.key === key);
  if (!field) return "";
  return field.text?.value || field.dropdown?.value || field.numeric?.value || "";
}

// Fires when we can't confidently auto-match a Fall/Winter Payment Link
// purchase to an existing account/player — an admin has to finish the
// registration by hand from the details in this email, same as the
// manual-reconciliation workaround used for other Payment Links.
async function notifyAdminOfUnmatchedFallWinterPayment({ email, playerName, amountCents, sessionId }) {
  try {
    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
    const toEmail = process.env.CONTACT_TO_EMAIL || fromEmail;
    await transporter.sendMail({
      from: fromEmail,
      to: toEmail,
      subject: "Fall/Winter payment received — needs manual registration",
      text: [
        "A Fall/Winter registration payment came in through the Stripe Payment Link, but it couldn't be automatically matched to an existing HuskiesHub account/player.",
        "",
        `Amount: $${(amountCents / 100).toFixed(2)}`,
        `Payer email: ${email || "(not provided)"}`,
        `Player name entered: ${playerName || "(not provided)"}`,
        `Stripe session: ${sessionId}`,
        "",
        "Please create/verify the registration manually from the Admin Dashboard → Registrations tab.",
      ].join("\n"),
    });
  } catch (err) {
    console.warn("Admin notification email not sent:", err.message);
  }
}

async function sendFallWinterConfirmationEmail(user, player) {
  try {
    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
    await transporter.sendMail({
      from: fromEmail,
      to: user.email,
      subject: "Fall/Winter Registration Confirmed — Empire State Huskies",
      text: [
        `Hi ${user.name},`,
        "",
        `Thanks for registering ${player?.name || "your player"} for the Fall/Winter 2026 season — welcome to the Huskies family!`,
        "",
        "Your $2,500 Fall/Winter registration payment has been received in full.",
        "",
        "Log in to your Parent Portal any time to check your schedule, payment history, and team chat.",
        "",
        "If you have any questions, just reply to this email.",
        "",
        "— Empire State Huskies Coaching Staff",
      ].join("\n"),
    });
  } catch (err) {
    console.warn("Fall/Winter confirmation email not sent:", err.message);
  }
}

// Reconciles a standalone Stripe Payment Link purchase (not created through
// our own checkout flow, so there's no pre-existing Payment/Registration to
// update) with an app account. Only auto-creates records when the match is
// unambiguous — email matches an existing User AND the typed player name
// matches exactly one of that user's children (or they only have one child).
// Anything less certain is routed to a human via email rather than guessed.
async function handleFallWinterPaymentLinkCompleted(session) {
  const email = (session.customer_details?.email || "").toLowerCase().trim();
  const playerName = extractCustomFieldValue(session, "player_name").trim();
  const amountCents = session.amount_total || 250000;

  const user = email ? await User.findOne({ email }) : null;
  if (!user) {
    await notifyAdminOfUnmatchedFallWinterPayment({ email, playerName, amountCents, sessionId: session.id });
    return;
  }

  const children = await Player.find({ _id: { $in: user.children || [] } });
  const normalizedTyped = playerName.toLowerCase();
  const player =
    children.find((c) => c.name?.toLowerCase().trim() === normalizedTyped) ||
    (children.length === 1 ? children[0] : null);

  if (!player) {
    await notifyAdminOfUnmatchedFallWinterPayment({ email, playerName, amountCents, sessionId: session.id });
    return;
  }

  const registration = await Registration.findOneAndUpdate(
    { playerId: player._id, season: FALL_WINTER_SEASON },
    {
      $setOnInsert: {
        playerId: player._id,
        teamId: player.teamId,
        season: FALL_WINTER_SEASON,
        status: "active",
        registrationFeeCents: amountCents,
        depositAmountCents: 0,
        autopayEnabled: false,
        createdBy: user._id,
      },
    },
    { upsert: true, new: true }
  );

  await Payment.create({
    type: "registration",
    userId: user._id,
    amountCents,
    stripeCheckoutSessionId: session.id,
    stripePaymentIntentId: session.payment_intent || null,
    status: "succeeded",
    description: `Fall/Winter 2026 Registration — ${player.name}`,
    relatedRegistrationId: registration._id,
  });

  await sendFallWinterConfirmationEmail(user, player);
}

// ---- Webhook event handling -------------------------------------------
// Stripe is the source of truth: these handlers only ever update Payment
// status/fields in response to a verified event, never optimistically from
// a request handler (see refund/checkout-session creation elsewhere in this
// controller, which only ever create "pending" records).

async function handleCheckoutSessionCompleted(session) {
  if (session.mode === "setup") {
    const { userId, registrationId } = session.metadata || {};
    if (!userId) return;

    const stripe = getStripeClient();
    const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent);
    const paymentMethodId = setupIntent.payment_method;
    if (!paymentMethodId) return;

    await stripe.customers.update(session.customer, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });

    await User.findByIdAndUpdate(userId, {
      stripeCustomerId: session.customer,
      defaultPaymentMethodId: paymentMethodId,
    });

    if (registrationId) {
      await Registration.findByIdAndUpdate(registrationId, {
        autopayEnabled: true,
        billingUserId: userId,
      });
    }
    return;
  }

  // mode: "payment" — one-time purchase (registration/deposit/camp/lesson/apparel)
  const payment = await Payment.findOne({ stripeCheckoutSessionId: session.id });
  if (!payment) {
    // Not a session our own checkout flow created — could be a standalone
    // Stripe Payment Link (e.g. the Fall/Winter-only link), tagged via
    // metadata set on the Payment Link itself.
    if (session.metadata?.linkType === "fallWinterRegistration") {
      await handleFallWinterPaymentLinkCompleted(session);
    }
    return;
  }

  payment.status = "succeeded";
  payment.stripePaymentIntentId = session.payment_intent || payment.stripePaymentIntentId;
  await payment.save();

  if (payment.type === "deposit" && payment.relatedRegistrationId) {
    await Registration.findByIdAndUpdate(payment.relatedRegistrationId, {
      depositPaidAt: new Date(),
    });
  }

  // Registration fee checkout also saved the card (setup_future_usage:
  // "off_session" on the session, set above) — use it to enroll the season-
  // balance autopay plan immediately instead of making the parent enter
  // their card again in a separate step.
  if (payment.type === "registration" && payment.relatedRegistrationId) {
    let registration = await Registration.findById(payment.relatedRegistrationId);

    if (session.payment_intent) {
      const stripe = getStripeClient();
      const intent = await stripe.paymentIntents.retrieve(session.payment_intent);
      const paymentMethodId = intent.payment_method;
      if (paymentMethodId) {
        await stripe.customers.update(session.customer, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
        await User.findByIdAndUpdate(payment.userId, {
          stripeCustomerId: session.customer,
          defaultPaymentMethodId: paymentMethodId,
        });
        registration = await Registration.findByIdAndUpdate(
          payment.relatedRegistrationId,
          { autopayEnabled: true, billingUserId: payment.userId },
          { new: true }
        );
      }
    }

    const user = await User.findById(payment.userId);
    if (user && registration) {
      await sendWelcomeEmail(user, registration);
    }
  }

  if (payment.type === "lesson" && payment.lessonSlotId) {
    // Atomic conditional increment — not a read-then-write — so two parents
    // completing checkout for the last slot at once can't both succeed.
    // The Stripe charge has already succeeded by this point either way; if
    // this update matches zero documents (slot filled in the meantime), we
    // deliberately do NOT auto-refund — logged for admin follow-up, matching
    // the existing pattern that refunds are always admin-triggered.
    const booked = await LessonSlot.findOneAndUpdate(
      { _id: payment.lessonSlotId, $expr: { $lt: ["$bookedCount", "$capacity"] } },
      { $inc: { bookedCount: 1 } }
    );
    if (!booked) {
      console.warn(
        `Lesson slot ${payment.lessonSlotId} was full when payment ${payment._id} completed — admin follow-up needed.`
      );
    }
  }
}

async function handlePaymentIntentSucceeded(paymentIntent) {
  // Primary confirmation path for off-session autopay charges (which are
  // created directly as PaymentIntents by the autopay run, not via Checkout).
  const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntent.id });
  if (!payment || payment.status === "succeeded") return;
  payment.status = "succeeded";
  await payment.save();
}

async function handlePaymentIntentFailed(paymentIntent) {
  const payment = await Payment.findOne({ stripePaymentIntentId: paymentIntent.id });
  if (!payment) return;
  payment.status = "failed";
  await payment.save();
}

async function handleChargeRefunded(charge) {
  const payment = await Payment.findOne({ stripePaymentIntentId: charge.payment_intent });
  if (!payment) return;
  payment.status = "refunded";
  payment.refundedAmountCents = charge.amount_refunded;
  payment.refundedAt = new Date();
  await payment.save();
}

const EVENT_HANDLERS = {
  "checkout.session.completed": (event) =>
    handleCheckoutSessionCompleted(event.data.object),
  "payment_intent.succeeded": (event) =>
    handlePaymentIntentSucceeded(event.data.object),
  "payment_intent.payment_failed": (event) =>
    handlePaymentIntentFailed(event.data.object),
  "charge.refunded": (event) => handleChargeRefunded(event.data.object),
};

// Called by webhookRoutes.js after signature verification. Guards against
// duplicate delivery by inserting the event id first — a duplicate-key error
// means "already handled," so we return without reprocessing.
async function processWebhookEvent(event) {
  try {
    await ProcessedStripeEvent.create({ stripeEventId: event.id, type: event.type });
  } catch (err) {
    if (err.code === 11000) return; // already processed
    throw err;
  }

  const handler = EVENT_HANDLERS[event.type];
  if (handler) {
    await handler(event);
  }
}

// ---- Autopay run (admin/system-triggered — no cron infra exists) -------

function currentBillingPeriod() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

async function notifyAutopayFailure(user, registration, reason) {
  try {
    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
    await transporter.sendMail({
      from: fromEmail,
      to: user.email,
      subject: "HuskiesHub — autopay charge failed",
      text: `We were unable to process this month's autopay charge for ${registration.season} (${reason}). Please log in and update your payment method.`,
    });
  } catch (err) {
    console.warn("Autopay failure email not sent:", err.message);
  }
}

// Processes one registration's autopay charge for the given period. Each
// registration is independent (own idempotency key, own Payment doc), so the
// caller runs these concurrently via Promise.all rather than a sequential loop.
async function processAutopayForRegistration(registration, billingPeriod) {
  let payment;
  try {
    payment = await Payment.create({
      type: "autopay",
      userId: registration.billingUserId,
      amountCents: registration.autopayAmountCents,
      status: "pending",
      description: `autopay — ${registration.season}`,
      relatedRegistrationId: registration._id,
      billingPeriod,
    });
  } catch (err) {
    if (err.code === 11000) {
      return { outcome: "skipped", registrationId: registration._id, reason: "already billed this period" };
    }
    return { outcome: "failed", registrationId: registration._id, reason: err.message };
  }

  const billingUser = await User.findById(registration.billingUserId);
  if (!billingUser?.stripeCustomerId || !billingUser?.defaultPaymentMethodId) {
    payment.status = "failed";
    await payment.save();
    return { outcome: "failed", registrationId: registration._id, reason: "no saved payment method" };
  }

  try {
    const stripe = getStripeClient();
    const intent = await stripe.paymentIntents.create(
      {
        amount: registration.autopayAmountCents,
        currency: "usd",
        customer: billingUser.stripeCustomerId,
        payment_method: billingUser.defaultPaymentMethodId,
        off_session: true,
        confirm: true,
        metadata: {
          type: "autopay",
          registrationId: registration._id.toString(),
          billingPeriod,
        },
      },
      { idempotencyKey: `autopay-${registration._id}-${billingPeriod}` }
    );

    payment.stripePaymentIntentId = intent.id;
    if (intent.status === "succeeded") payment.status = "succeeded";
    await payment.save();

    if (intent.status === "succeeded") {
      registration.autopayInstallmentsCompleted += 1;
      // Fixed installment plan, not indefinite billing — stop automatically
      // once the season balance is fully paid off.
      if (registration.autopayInstallmentsCompleted >= registration.autopayTotalInstallments) {
        registration.autopayEnabled = false;
        registration.status = "completed";
      }
      await registration.save();
    }

    return { outcome: "billed", registrationId: registration._id, paymentId: payment._id };
  } catch (err) {
    payment.status = "failed";
    await payment.save();
    await notifyAutopayFailure(billingUser, registration, err.message);
    return { outcome: "failed", registrationId: registration._id, reason: err.message };
  }
}

// Idempotent: safe to re-trigger for the same registration/month. The unique
// partial index on Payment{relatedRegistrationId, billingPeriod} (type:"autopay")
// is the actual guard — the insert-first ordering in the helper above is what
// makes it effective.
// Shared by the admin-triggered HTTP route and the scheduled-cron route.
async function executeAutopayRun({ respectDayOfMonth }) {
  const billingPeriod = currentBillingPeriod();
  const todayDayOfMonth = new Date().getDate();

  const filter = {
    autopayEnabled: true,
    billingUserId: { $ne: null },
    autopayAmountCents: { $gt: 0 },
    $expr: { $lt: ["$autopayInstallmentsCompleted", "$autopayTotalInstallments"] },
  };
  if (respectDayOfMonth) {
    filter.autopayDayOfMonth = todayDayOfMonth;
  }

  const registrations = await Registration.find(filter);

  const results = await Promise.all(
    registrations.map((registration) => processAutopayForRegistration(registration, billingPeriod))
  );

  const group = (outcome) =>
    results
      .filter((result) => result.outcome === outcome)
      .map(({ registrationId, paymentId, reason }) => ({ registrationId, paymentId, reason }));

  return {
    billingPeriod,
    billed: group("billed"),
    skipped: group("skipped"),
    failed: group("failed"),
  };
}

// Admin-triggered manual run — ignores day-of-month so an admin can force a
// catch-up run any day (e.g. if the scheduled cron run failed).
const runAutopay = async (req, res) => {
  try {
    const result = await executeAutopayRun({ respectDayOfMonth: false });
    return res.json(result);
  } catch (err) {
    console.error("Run autopay error:", err);
    return res.status(500).json({ message: "Autopay run failed" });
  }
};

// Called daily by Cloud Scheduler (see infra) — only charges registrations
// whose autopayDayOfMonth is today, and only actually bills once per calendar
// month per registration regardless (idempotency key), so running this daily
// is safe. Authenticated by a shared secret rather than a user JWT, since
// there's no human admin session behind a scheduled job.
const runAutopayCron = async (req, res) => {
  const providedSecret = req.headers["x-cron-secret"];
  if (!process.env.CRON_SECRET || providedSecret !== process.env.CRON_SECRET) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const result = await executeAutopayRun({ respectDayOfMonth: true });
    return res.json(result);
  } catch (err) {
    console.error("Run autopay cron error:", err);
    return res.status(500).json({ message: "Autopay cron run failed" });
  }
};

// ---- Refunds (admin-triggered, webhook-confirmed — see handleChargeRefunded) --

const refundPayment = async (req, res) => {
  const { id } = req.params;
  const { amountCents } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid payment id" });
  }

  try {
    const payment = await Payment.findById(id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    if (!payment.stripePaymentIntentId) {
      return res.status(400).json({ message: "Payment has no associated charge to refund" });
    }
    if (payment.status !== "succeeded") {
      return res.status(400).json({ message: "Only succeeded payments can be refunded" });
    }

    const stripe = getStripeClient();
    await stripe.refunds.create({
      payment_intent: payment.stripePaymentIntentId,
      ...(amountCents ? { amount: amountCents } : {}),
    });

    // Status/refundedAmountCents/refundedAt are set by the charge.refunded
    // webhook, not here — Stripe stays the single source of truth.
    return res.status(202).json({ message: "Refund initiated" });
  } catch (err) {
    console.error("Refund payment error:", err);
    return res.status(500).json({ message: err.message || "Failed to initiate refund" });
  }
};

// ---- Balance & history --------------------------------------------------

const getBalance = async (req, res) => {
  const { playerId } = req.query;

  if (!playerId || !mongoose.Types.ObjectId.isValid(playerId)) {
    return res.status(400).json({ message: "Valid playerId is required" });
  }
  if (!canAccessPlayer(req.user, playerId)) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const registrations = await Registration.find({ playerId });
    const balances = await Promise.all(registrations.map(computeRegistrationBalance));
    return res.json(balances);
  } catch (err) {
    console.error("Get balance error:", err);
    return res.status(500).json({ message: "Failed to compute balance" });
  }
};

const getPaymentHistory = async (req, res) => {
  const { userId } = req.query;
  const targetUserId = userId || req.user._id.toString();

  if (req.user.role !== "admin" && targetUserId !== req.user._id.toString()) {
    return res.status(403).json({ message: "Forbidden" });
  }

  try {
    const payments = await Payment.find({ userId: targetUserId }).sort({ createdAt: -1 });
    return res.json(payments);
  } catch (err) {
    console.error("Get payment history error:", err);
    return res.status(500).json({ message: "Failed to fetch payment history" });
  }
};

// Read from an env var (not hardcoded) so the link can be rotated — e.g. if
// it's ever deactivated/recreated in Stripe — without a frontend deploy.
const getFallWinterPaymentLink = async (req, res) => {
  const url = process.env.FALL_WINTER_PAYMENT_LINK || null;
  return res.json({ url });
};

// ---- Reminder emails (admin-triggered, no dedup/rate-limiting in this pass) --

async function sendReminderIfOwed(registration) {
  const { balanceCents } = await computeRegistrationBalance(registration);
  if (balanceCents <= 0) return null;

  const billingUser = registration.billingUserId
    ? await User.findById(registration.billingUserId)
    : await User.findById(registration.createdBy);
  if (!billingUser?.email) return null;

  try {
    const transporter = getTransporter();
    const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
    await transporter.sendMail({
      from: fromEmail,
      to: billingUser.email,
      subject: "HuskiesHub — outstanding balance reminder",
      text: `You have an outstanding balance of $${(balanceCents / 100).toFixed(2)} for ${registration.season}. Please log in to your parent portal to make a payment.`,
    });
    return { registrationId: registration._id, email: billingUser.email, balanceCents };
  } catch (err) {
    console.warn("Reminder email not sent:", err.message);
    return null;
  }
}

const sendReminders = async (req, res) => {
  try {
    const registrations = await Registration.find({ status: { $ne: "withdrawn" } });
    const results = await Promise.all(registrations.map(sendReminderIfOwed));
    const sent = results.filter(Boolean);
    return res.json({ remindersSent: sent.length, details: sent });
  } catch (err) {
    console.error("Send reminders error:", err);
    return res.status(500).json({ message: "Failed to send reminders" });
  }
};

// ---- QuickBooks CSV export ----------------------------------------------
// 3-column "Date, Description, Amount" format for QBO's Banking → Upload from
// file import: header row, one date format, plain numeric amounts (no $/commas),
// positive for money in / negative for money out. Refunds get their own
// negative row rather than netting against the original charge, matching
// Stripe's actual two ledger events.

function formatDateMMDDYYYY(date) {
  const d = new Date(date);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function csvField(value) {
  const str = String(value ?? "");
  return `"${str.replace(/"/g, '""')}"`;
}

const exportQuickbooksCsv = async (req, res) => {
  const { from, to } = req.query;

  if (!from || !to) {
    return res.status(400).json({ message: "from and to date query params are required" });
  }

  try {
    const payments = await Payment.find({
      status: { $in: ["succeeded", "refunded"] },
      createdAt: { $gte: new Date(from), $lte: new Date(to) },
    })
      .populate("userId")
      .sort({ createdAt: 1 });

    const rows = [["Date", "Description", "Amount"]];
    payments.forEach((payment) => {
      const label = `${payment.description || payment.type} — ${payment.userId?.name || "unknown"}`;
      rows.push([
        formatDateMMDDYYYY(payment.createdAt),
        label,
        (payment.amountCents / 100).toFixed(2),
      ]);

      if (payment.status === "refunded") {
        rows.push([
          formatDateMMDDYYYY(payment.refundedAt || payment.updatedAt),
          `${label} (refund)`,
          (-(payment.refundedAmountCents || payment.amountCents) / 100).toFixed(2),
        ]);
      }
    });

    const csv = rows.map((row) => row.map(csvField).join(",")).join("\n");

    res.set("Content-Type", "text/csv");
    res.set(
      "Content-Disposition",
      `attachment; filename="huskieshub-payments-${from}-${to}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    console.error("Export QuickBooks CSV error:", err);
    return res.status(500).json({ message: "Failed to export CSV" });
  }
};

module.exports = {
  createCheckoutSession,
  createSetupSession,
  processWebhookEvent,
  runAutopay,
  runAutopayCron,
  refundPayment,
  getBalance,
  getPaymentHistory,
  sendReminders,
  exportQuickbooksCsv,
  computeRegistrationBalance,
  getFallWinterPaymentLink,
};
