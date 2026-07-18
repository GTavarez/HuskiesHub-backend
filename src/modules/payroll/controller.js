const mongoose = require("mongoose");
const CoachPayment = require("./model");

const createPayment = async (req, res) => {
  const { coachUserId, payPeriodStart, payPeriodEnd, amountCents } = req.body;

  if (!coachUserId || !payPeriodStart || !payPeriodEnd || amountCents === undefined) {
    return res.status(400).json({
      message: "coachUserId, payPeriodStart, payPeriodEnd, and amountCents are required",
    });
  }

  try {
    const payment = await CoachPayment.create({
      coachUserId,
      payPeriodStart,
      payPeriodEnd,
      amountCents,
      createdBy: req.user._id,
    });
    return res.status(201).json(payment);
  } catch (err) {
    console.error("Create coach payment error:", err);
    return res.status(400).json({ message: err.message });
  }
};

// Self-or-admin, same pattern as payments/controller.js's getPaymentHistory —
// a coach can see their own pay history, admin sees everyone's.
const listPayments = async (req, res) => {
  const { coachUserId } = req.query;
  const targetCoachId = coachUserId || req.user._id.toString();

  if (req.user.role !== "admin" && targetCoachId !== req.user._id.toString()) {
    return res.status(403).json({ message: "Forbidden" });
  }
  if (!mongoose.Types.ObjectId.isValid(targetCoachId)) {
    return res.status(400).json({ message: "Invalid coachUserId" });
  }

  try {
    const payments = await CoachPayment.find({ coachUserId: targetCoachId }).sort({
      payPeriodStart: -1,
    });
    return res.json(payments);
  } catch (err) {
    console.error("List coach payments error:", err);
    return res.status(500).json({ message: "Failed to fetch coach payments" });
  }
};

const updatePaymentStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid payment id" });
  }
  if (!["unpaid", "paid"].includes(status)) {
    return res.status(400).json({ message: "Invalid status" });
  }

  try {
    const payment = await CoachPayment.findByIdAndUpdate(
      id,
      { status, paidAt: status === "paid" ? new Date() : null },
      { new: true }
    );
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    return res.json(payment);
  } catch (err) {
    console.error("Update coach payment error:", err);
    return res.status(400).json({ message: err.message });
  }
};

module.exports = { createPayment, listPayments, updatePaymentStatus };
