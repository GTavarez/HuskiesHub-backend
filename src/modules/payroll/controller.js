const mongoose = require("mongoose");
const CoachPayment = require("./model");
const User = require("../users/model");
const { PAYMENT_METHODS } = require("./model");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Admin-only picker data: every coach account, so a payment can be recorded
// against a name instead of a raw account id.
const listPayees = async (req, res) => {
  try {
    const coaches = await User.find({ role: "coach", isTestAccount: { $ne: true } })
      .select("name email teamId")
      .sort({ name: 1 })
      .lean();
    return res.json(coaches);
  } catch (err) {
    console.error("List payees error:", err);
    return res.status(500).json({ message: "Failed to fetch coaches" });
  }
};

const createPayment = async (req, res) => {
  const { coachUserId, payPeriodStart, payPeriodEnd, amountCents, note, allowDuplicate } = req.body;

  if (!coachUserId || !payPeriodStart || !payPeriodEnd || amountCents === undefined) {
    return res.status(400).json({
      message: "coachUserId, payPeriodStart, payPeriodEnd, and amountCents are required",
    });
  }
  if (!isValidId(coachUserId)) {
    return res.status(400).json({ message: "Invalid coachUserId" });
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    return res.status(400).json({ message: "Amount must be greater than zero" });
  }
  const start = new Date(payPeriodStart);
  const end = new Date(payPeriodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return res.status(400).json({ message: "Pay period end must be on or after the start" });
  }

  try {
    const coach = await User.findById(coachUserId).select("role").lean();
    if (!coach || coach.role !== "coach") {
      return res.status(400).json({ message: "That account is not a coach" });
    }

    // Guard against paying the same coach twice for the same period by
    // accident (a double click, or two admins entering it).
    if (!allowDuplicate) {
      const existing = await CoachPayment.findOne({
        coachUserId,
        payPeriodStart: start,
        payPeriodEnd: end,
      }).lean();
      if (existing) {
        return res.status(409).json({
          message: "A payment for this coach and pay period already exists.",
          duplicate: true,
        });
      }
    }

    const payment = await CoachPayment.create({
      coachUserId,
      payPeriodStart: start,
      payPeriodEnd: end,
      amountCents,
      note: typeof note === "string" ? note : "",
      createdBy: req.user._id,
    });
    return res.status(201).json(payment);
  } catch (err) {
    console.error("Create coach payment error:", err);
    return res.status(400).json({ message: err.message });
  }
};

// A coach sees only their own pay history. An admin sees every coach's
// unless they narrow to one with ?coachUserId=.
const listPayments = async (req, res) => {
  const { coachUserId } = req.query;
  const isAdmin = req.user.role === "admin";

  const filter = {};
  if (coachUserId) {
    if (!isValidId(coachUserId)) {
      return res.status(400).json({ message: "Invalid coachUserId" });
    }
    if (!isAdmin && coachUserId !== req.user._id.toString()) {
      return res.status(403).json({ message: "Forbidden" });
    }
    filter.coachUserId = coachUserId;
  } else if (!isAdmin) {
    filter.coachUserId = req.user._id;
  }

  try {
    const payments = await CoachPayment.find(filter)
      .sort({ payPeriodStart: -1, createdAt: -1 })
      .populate("coachUserId", "name email")
      .lean();
    // Keep coachUserId a plain id for existing callers; add the name beside it.
    return res.json(
      payments.map(({ coachUserId: coach, ...rest }) => ({
        ...rest,
        coachUserId: coach?._id || coach,
        coachName: coach?.name || "Unknown coach",
        coachEmail: coach?.email || "",
      }))
    );
  } catch (err) {
    console.error("List coach payments error:", err);
    return res.status(500).json({ message: "Failed to fetch coach payments" });
  }
};

const updatePaymentStatus = async (req, res) => {
  const { id } = req.params;
  const { status, method, reference } = req.body;

  if (!isValidId(id)) {
    return res.status(400).json({ message: "Invalid payment id" });
  }
  if (!["unpaid", "paid"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }
  if (method !== undefined && method !== "" && !PAYMENT_METHODS.includes(method)) {
    return res.status(400).json({ message: "Invalid payment method" });
  }

  try {
    const existing = await CoachPayment.findById(id).select("method stripeTransferId").lean();
    if (!existing) return res.status(404).json({ message: "Payment not found" });
    // Money that went out through Stripe can't be un-sent by flipping a flag.
    if (existing.method === "stripe" || (existing.stripeTransferId && existing.stripeTransferId !== "")) {
      return res.status(409).json({ message: "This payment was sent through Stripe and can't be changed here." });
    }

    const update =
      status === "paid"
        ? {
            status,
            paidAt: new Date(),
            paidBy: req.user._id,
            method: method || "",
            reference: typeof reference === "string" ? reference.trim() : "",
          }
        : { status, paidAt: null, paidBy: null, method: "", reference: "" };

    const payment = await CoachPayment.findByIdAndUpdate(id, update, { new: true });
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    return res.json(payment);
  } catch (err) {
    console.error("Update coach payment error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const deletePayment = async (req, res) => {
  const { id } = req.params;
  if (!isValidId(id)) {
    return res.status(400).json({ message: "Invalid payment id" });
  }
  try {
    const payment = await CoachPayment.findById(id);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    // A record marked paid is the proof someone was paid; undo it first
    // rather than letting it vanish in one click.
    if (payment.status === "paid") {
      return res.status(409).json({ message: "Mark it unpaid before deleting a paid record." });
    }
    await payment.deleteOne();
    return res.status(204).end();
  } catch (err) {
    console.error("Delete coach payment error:", err);
    return res.status(500).json({ message: "Failed to delete payment" });
  }
};

module.exports = { listPayees, createPayment, listPayments, updatePaymentStatus, deletePayment };
