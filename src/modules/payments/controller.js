const mongoose = require("mongoose");
const { getStripeClient } = require("./stripeClient");
const Payment = require("./model");
const ProcessedStripeEvent = require("./processedStripeEvent.model");
const Registration = require("../registrations/model");
const Product = require("../products/model");
const LessonSlot = require("../lesson-slots/model");
const User = require("../users/model");
const Waiver = require("../waivers/model");
const WaiverSignature = require("../waiver-signatures/model");
const { canAccessPlayer } = require("../../common/utils/ownership");
const { getTransporter } = require("../../common/utils/mailer");

const TYPES_REQUIRING_REGISTRATION = ["registration", "deposit"];
const TYPES_REQUIRING_PRODUCT = ["camp", "lesson", "apparel"];

async function ensureStripeCustomer(user) {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: user.email,
    name: user.name,
    metadata: { userId: user._id.toString() },
  });

  await User.findByIdAndUpdate(user._id, { stripeCustomerId: customer.id });
  return customer.id;
}

// ---- Checkout session creation ----------------------------------------

const createCheckoutSession = async (req, res) => {
  const { type, productId, registrationId, lessonSlotId } = req.body;

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

      amountCents = type === "deposit" ? registration.depositAmountCents : registration.registrationFeeCents;
      description = `${type} — ${registration.season}`;
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
  if (!payment) return;

  payment.status = "succeeded";
  payment.stripePaymentIntentId = session.payment_intent || payment.stripePaymentIntentId;
  await payment.save();

  if (payment.type === "deposit" && payment.relatedRegistrationId) {
    await Registration.findByIdAndUpdate(payment.relatedRegistrationId, {
      depositPaidAt: new Date(),
    });
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
const runAutopay = async (req, res) => {
  const billingPeriod = currentBillingPeriod();

  try {
    const registrations = await Registration.find({
      autopayEnabled: true,
      billingUserId: { $ne: null },
      autopayAmountCents: { $gt: 0 },
    });

    const results = await Promise.all(
      registrations.map((registration) =>
        processAutopayForRegistration(registration, billingPeriod)
      )
    );

    const group = (outcome) =>
      results
        .filter((result) => result.outcome === outcome)
        .map(({ registrationId, paymentId, reason }) => ({ registrationId, paymentId, reason }));

    return res.json({
      billingPeriod,
      billed: group("billed"),
      skipped: group("skipped"),
      failed: group("failed"),
    });
  } catch (err) {
    console.error("Run autopay error:", err);
    return res.status(500).json({ message: "Autopay run failed" });
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

async function computeRegistrationBalance(registration) {
  const paidAgg = await Payment.aggregate([
    {
      $match: {
        relatedRegistrationId: registration._id,
        type: { $in: ["registration", "deposit"] },
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
  refundPayment,
  getBalance,
  getPaymentHistory,
  sendReminders,
  exportQuickbooksCsv,
  computeRegistrationBalance,
};
