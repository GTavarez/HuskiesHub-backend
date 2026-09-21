const mongoose = require("mongoose");
const CoachPayment = require("./model");
const User = require("../users/model");
const { getStripeClient } = require("../payments/stripeClient");

// Stripe Connect payouts to coaches. Each coach onboards themselves on a
// Stripe-hosted page (identity and bank details never touch this app), and the
// admin then sends a coach's recorded pay with one deliberate click. The
// ledger in ./controller.js stays the source of truth for what is owed.

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// "not_started" | "incomplete" | "ready"
function connectStatus(account) {
  if (!account) return "not_started";
  return account.capabilities?.transfers === "active" ? "ready" : "incomplete";
}

async function loadAccount(stripe, accountId) {
  if (!accountId) return null;
  try {
    return await stripe.accounts.retrieve(accountId);
  } catch (err) {
    console.warn("Could not load Stripe account:", err.message);
    return null;
  }
}

// GET /connect/platform (admin): which Stripe account payouts would come
// from, whether Connect is usable on it, and how much is available to send.
const getPlatform = async (req, res) => {
  try {
    const stripe = getStripeClient();
    const account = await stripe.accounts.retrieve();
    let connectEnabled = true;
    let connectMessage = "";
    try {
      await stripe.accounts.list({ limit: 1 });
    } catch (err) {
      connectEnabled = false;
      connectMessage = err.message;
    }
    let availableCents = null;
    let livemode = null;
    try {
      const balance = await stripe.balance.retrieve();
      livemode = balance.livemode;
      availableCents = balance.available
        .filter((b) => b.currency === "usd")
        .reduce((sum, b) => sum + b.amount, 0);
    } catch (err) {
      console.warn("Could not read Stripe balance:", err.message);
    }
    return res.json({
      accountId: account.id,
      name: account.settings?.dashboard?.display_name || account.business_profile?.name || "",
      livemode,
      connectEnabled,
      connectMessage,
      availableCents,
    });
  } catch (err) {
    console.error("Stripe platform status error:", err);
    return res.status(502).json({ message: err.message || "Could not reach Stripe" });
  }
};

// GET /connect/coaches (admin): payout-setup state for every coach.
const listCoachConnect = async (req, res) => {
  try {
    const stripe = getStripeClient();
    const coaches = await User.find({ role: "coach", isTestAccount: { $ne: true } })
      .select("name email +stripeConnectAccountId")
      .sort({ name: 1 })
      .lean();
    const rows = await Promise.all(
      coaches.map(async (coach) => {
        const account = await loadAccount(stripe, coach.stripeConnectAccountId);
        return {
          coachUserId: coach._id,
          name: coach.name,
          status: coach.stripeConnectAccountId && !account ? "incomplete" : connectStatus(account),
        };
      })
    );
    return res.json(rows);
  } catch (err) {
    console.error("List coach connect error:", err);
    return res.status(502).json({ message: err.message || "Could not reach Stripe" });
  }
};

// GET /connect/me (coach): this coach's own payout-setup state.
const getMyConnect = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("+stripeConnectAccountId").lean();
    if (!user?.stripeConnectAccountId) {
      return res.json({ status: "not_started" });
    }
    const account = await loadAccount(getStripeClient(), user.stripeConnectAccountId);
    return res.json({
      status: account ? connectStatus(account) : "incomplete",
      detailsSubmitted: Boolean(account?.details_submitted),
    });
  } catch (err) {
    console.error("Get my connect error:", err);
    return res.status(502).json({ message: err.message || "Could not reach Stripe" });
  }
};

// POST /connect/onboard (coach): creates the coach's Express account the
// first time, then returns a short-lived Stripe-hosted signup link.
const startOnboarding = async (req, res) => {
  const frontendUrl = process.env.FRONTEND_URL;
  if (!frontendUrl) {
    return res.status(500).json({ message: "FRONTEND_URL is not configured" });
  }

  try {
    const stripe = getStripeClient();
    const user = await User.findById(req.user._id).select("+stripeConnectAccountId");
    if (!user) return res.status(404).json({ message: "User not found" });

    let accountId = user.stripeConnectAccountId;
    if (!accountId) {
      const account = await stripe.accounts.create(
        {
          type: "express",
          country: "US",
          email: user.email,
          business_type: "individual",
          capabilities: { transfers: { requested: true } },
          metadata: { huskiesUserId: String(user._id) },
        },
        { idempotencyKey: `coach-connect-account-${user._id}` }
      );
      accountId = account.id;
      user.stripeConnectAccountId = accountId;
      await user.save();
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      type: "account_onboarding",
      refresh_url: `${frontendUrl}/coach?payouts=refresh`,
      return_url: `${frontendUrl}/coach?payouts=return`,
    });
    return res.json({ url: link.url });
  } catch (err) {
    console.error("Start Stripe onboarding error:", err);
    return res.status(502).json({ message: err.message || "Could not start Stripe setup" });
  }
};

// POST /:id/stripe-payout (admin): sends one recorded payment to the coach's
// Stripe account. Real money moves here, so every precondition is checked
// first, the record is claimed before Stripe is called, and Stripe is given an
// idempotency key so a double click can never send it twice.
const payWithStripe = async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ message: "Invalid payment id" });
  }

  try {
    const payment = await CoachPayment.findById(id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    if (payment.status === "paid") {
      return res.status(409).json({ message: "This payment is already marked paid." });
    }
    if (!Number.isInteger(payment.amountCents) || payment.amountCents <= 0) {
      return res.status(400).json({ message: "This payment has no valid amount." });
    }

    const coach = await User.findById(payment.coachUserId)
      .select("name role +stripeConnectAccountId")
      .lean();
    if (!coach || coach.role !== "coach") {
      return res.status(400).json({ message: "That account is not a coach." });
    }
    if (!coach.stripeConnectAccountId) {
      return res.status(400).json({ message: `${coach.name} hasn't set up Stripe payouts yet.` });
    }

    const stripe = getStripeClient();
    const account = await loadAccount(stripe, coach.stripeConnectAccountId);
    if (connectStatus(account) !== "ready") {
      return res
        .status(400)
        .json({ message: `${coach.name} hasn't finished Stripe setup, so they can't be paid yet.` });
    }

    const balance = await stripe.balance.retrieve();
    const availableCents = balance.available
      .filter((b) => b.currency === "usd")
      .reduce((sum, b) => sum + b.amount, 0);
    if (availableCents < payment.amountCents) {
      return res.status(400).json({
        message:
          `Not enough available in Stripe: $${(availableCents / 100).toFixed(2)} available, ` +
          `$${(payment.amountCents / 100).toFixed(2)} needed.`,
      });
    }

    // Claim the record so a second request can't also send it.
    const claimed = await CoachPayment.findOneAndUpdate(
      { _id: id, status: "unpaid", stripeTransferId: null },
      { $set: { stripeTransferId: "sending" } }
    );
    if (!claimed) {
      return res.status(409).json({ message: "This payment is already being sent." });
    }

    let transfer;
    try {
      transfer = await stripe.transfers.create(
        {
          amount: payment.amountCents,
          currency: "usd",
          destination: coach.stripeConnectAccountId,
          description: `Coach pay ${payment.payPeriodStart.toISOString().slice(0, 10)} to ${payment.payPeriodEnd
            .toISOString()
            .slice(0, 10)}`,
          transfer_group: `coach-pay-${id}`,
          metadata: { coachPaymentId: id, coachUserId: String(payment.coachUserId) },
        },
        { idempotencyKey: `coach-pay-${id}` }
      );
    } catch (err) {
      await CoachPayment.updateOne({ _id: id }, { $set: { stripeTransferId: null } });
      console.error("Stripe transfer failed:", err);
      return res.status(502).json({ message: err.message || "Stripe could not send the payment." });
    }

    try {
      const updated = await CoachPayment.findByIdAndUpdate(
        id,
        {
          status: "paid",
          paidAt: new Date(),
          paidBy: req.user._id,
          method: "stripe",
          reference: transfer.id,
          stripeTransferId: transfer.id,
        },
        { new: true }
      );
      return res.json(updated);
    } catch (err) {
      // The money has already gone; say so plainly rather than a bare error.
      console.error(`Stripe transfer ${transfer.id} sent but the record was not updated:`, err);
      return res.status(500).json({
        message: `The payment WAS sent to Stripe (transfer ${transfer.id}) but could not be recorded here. Do not send it again; mark it paid by hand.`,
      });
    }
  } catch (err) {
    console.error("Pay with Stripe error:", err);
    return res.status(502).json({ message: err.message || "Stripe payout failed" });
  }
};

module.exports = { getPlatform, listCoachConnect, getMyConnect, startOnboarding, payWithStripe };
