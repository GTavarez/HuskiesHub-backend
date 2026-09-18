const mongoose = require("mongoose");
const crypto = require("crypto");
const LessonRequestSlot = require("./model");
const { getTransporter } = require("../../common/utils/mailer");

const ACTION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const PACKAGE_LABELS = {
  fall_lesson_package: "Fall Lesson Package",
  academy_plus_1: "Academy + 1 Lesson",
  academy_plus_2: "Academy + 2 Lessons",
};

const PACKAGE_PAYMENT_LINK_ENV = {
  fall_lesson_package: "STRIPE_PAYMENT_LINK_FALL_LESSON_PACKAGE",
  academy_plus_1: "STRIPE_PAYMENT_LINK_ACADEMY_PLUS_1",
  academy_plus_2: "STRIPE_PAYMENT_LINK_ACADEMY_PLUS_2",
};

function frontendUrl() {
  return process.env.FRONTEND_URL || "http://localhost:5173";
}

function fromEmail() {
  return process.env.CONTACT_FROM_EMAIL || process.env.SMTP_USER;
}

function hashToken(rawToken) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * GET /api/lesson-requests/open-slots
 * Public — currently open slots only, sorted for a clean weekly display.
 */
const listOpenSlots = async (req, res) => {
  try {
    const slots = await LessonRequestSlot.find({ status: "open" }).sort({
      dayOfWeek: 1,
      startTime: 1,
    });
    return res.json(slots);
  } catch (err) {
    console.error("List open lesson slots error:", err);
    return res.status(500).json({ message: "Failed to fetch open slots" });
  }
};

/**
 * GET /api/lesson-requests/schedule
 * Public — every defined slot's day/time/status, for rendering a weekly
 * grid. Deliberately excludes athleteName/parentName/contact fields — a
 * booked slot shows as "booked", never who booked it.
 */
const listScheduleOverview = async (req, res) => {
  try {
    const slots = await LessonRequestSlot.find({}, "dayOfWeek location startTime endTime timeLabel status").sort({
      dayOfWeek: 1,
      startTime: 1,
    });
    return res.json(slots);
  } catch (err) {
    console.error("List lesson schedule overview error:", err);
    return res.status(500).json({ message: "Failed to fetch schedule" });
  }
};

// Best-effort, never blocks the request flow — mirrors sendWelcomeEmail's style.
// One token covers both actions for this request cycle — the landing page's
// Confirm/Decline buttons both send the same token, differing only in the
// `action` field of the POST body, matching the single actionTokenHash on
// the schema.
async function notifyAdminOfNewRequest(slot, rawToken) {
  try {
    const transporter = getTransporter();
    const toEmail = process.env.LESSON_REQUEST_ADMIN_EMAIL || process.env.CONTACT_TO_EMAIL;
    if (!toEmail) return;

    const actUrl = `${frontendUrl()}/lesson-requests/act?token=${rawToken}`;

    await transporter.sendMail({
      from: fromEmail(),
      to: toEmail,
      subject: `New lesson request — ${slot.athleteName} (${slot.dayOfWeek} ${slot.timeLabel})`,
      text: [
        `New lesson slot request:`,
        "",
        `Athlete: ${slot.athleteName}`,
        `Parent: ${slot.parentName} — ${slot.parentEmail} — ${slot.parentPhone}`,
        `Package: ${PACKAGE_LABELS[slot.packageType] || slot.packageType}`,
        `Slot: ${slot.dayOfWeek} ${slot.timeLabel} — ${slot.location}`,
        "",
        `Review and confirm/decline: ${actUrl}`,
        "",
        `You can also manage requests from the Admin Dashboard → Lesson Requests tab.`,
      ].join("\n"),
    });
  } catch (err) {
    console.warn("Lesson request admin notification not sent:", err.message);
  }
}

/**
 * POST /api/lesson-requests
 * Public — parent submits a request. Atomic claim: findOneAndUpdate guarded
 * on status:"open" so two simultaneous requests for the same slot can't both
 * win (mirrors the LessonSlot capacity guard in payments/controller.js).
 */
const createRequest = async (req, res) => {
  const { slotId, athleteName, parentName, parentEmail, parentPhone, packageType } = req.body;

  if (!mongoose.Types.ObjectId.isValid(slotId)) {
    return res.status(400).json({ message: "Invalid slotId" });
  }
  if (!athleteName || !parentName || !parentEmail || !parentPhone || !packageType) {
    return res.status(400).json({ message: "All fields are required" });
  }
  if (!PACKAGE_LABELS[packageType]) {
    return res.status(400).json({ message: "Invalid package type" });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const actionTokenHash = hashToken(rawToken);

  try {
    const slot = await LessonRequestSlot.findOneAndUpdate(
      { _id: slotId, status: "open" },
      {
        $set: {
          status: "requested",
          athleteName,
          parentName,
          parentEmail,
          parentPhone,
          packageType,
          requestedAt: new Date(),
          actionTokenHash,
          actionTokenExpires: new Date(Date.now() + ACTION_TOKEN_TTL_MS),
        },
        $push: {
          history: {
            event: "requested",
            at: new Date(),
            athleteName,
            parentName,
            parentEmail,
            parentPhone,
            packageType,
          },
        },
      },
      { new: true }
    );

    if (!slot) {
      return res
        .status(409)
        .json({ message: "This slot was just requested by someone else — please choose another." });
    }

    await notifyAdminOfNewRequest(slot, rawToken);
    return res.status(201).json({
      message: "Thanks — we'll be in touch to confirm your slot.",
    });
  } catch (err) {
    console.error("Create lesson request error:", err);
    return res.status(400).json({ message: err.message });
  }
};

async function sendParentConfirmationEmail(slot) {
  try {
    const transporter = getTransporter();
    const paymentLinkEnvKey = PACKAGE_PAYMENT_LINK_ENV[slot.packageType];
    const paymentLink = paymentLinkEnvKey ? process.env[paymentLinkEnvKey] : null;

    await transporter.sendMail({
      from: fromEmail(),
      to: slot.parentEmail,
      subject: "Your lesson slot is confirmed!",
      text: [
        `Hi ${slot.parentName},`,
        "",
        `${slot.athleteName}'s weekly lesson slot is confirmed: ${slot.dayOfWeek} ${slot.timeLabel} at ${slot.location}.`,
        `Package: ${PACKAGE_LABELS[slot.packageType] || slot.packageType}`,
        "",
        paymentLink
          ? `Please complete payment here: ${paymentLink}`
          : "We'll follow up shortly with payment details.",
        "",
        "See you on the field!",
      ].join("\n"),
    });
  } catch (err) {
    console.warn("Lesson confirmation email not sent:", err.message);
  }
}

async function sendParentDeclineEmail(slot) {
  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: fromEmail(),
      to: slot.parentEmail,
      subject: "Update on your lesson slot request",
      text: [
        `Hi ${slot.parentName},`,
        "",
        `Unfortunately the ${slot.dayOfWeek} ${slot.timeLabel} slot you requested for ${slot.athleteName} is no longer available.`,
        "Feel free to check our current open slots and submit another request.",
        "",
        "Sorry for the inconvenience!",
      ].join("\n"),
    });
  } catch (err) {
    console.warn("Lesson decline email not sent:", err.message);
  }
}

// Shared by both the token-authenticated public action and the admin
// dashboard buttons. Atomic guard on status:"requested" — returns null if
// the request was already handled (by the other path, or twice).
async function applyConfirm(slot, reviewedByUserId) {
  const confirmed = await LessonRequestSlot.findOneAndUpdate(
    { _id: slot._id, status: "requested" },
    {
      $set: {
        status: "confirmed",
        confirmedAt: new Date(),
        reviewedBy: reviewedByUserId || null,
        actionTokenHash: null,
        actionTokenExpires: null,
      },
      $push: {
        history: {
          event: "confirmed",
          at: new Date(),
          athleteName: slot.athleteName,
          parentName: slot.parentName,
          parentEmail: slot.parentEmail,
          parentPhone: slot.parentPhone,
          packageType: slot.packageType,
        },
      },
    },
    { new: true }
  );
  if (!confirmed) return null;
  await sendParentConfirmationEmail(confirmed);
  return confirmed;
}

async function applyDecline(slot) {
  // Deliberately NOT { new: true } — need the PRE-image (still has the
  // family fields) to email the just-declined parent, since $set wipes them.
  const declined = await LessonRequestSlot.findOneAndUpdate(
    { _id: slot._id, status: "requested" },
    {
      $set: {
        status: "open",
        athleteName: "",
        parentName: "",
        parentEmail: "",
        parentPhone: "",
        packageType: null,
        paymentStatus: "not_invoiced",
        requestedAt: null,
        confirmedAt: null,
        reviewedBy: null,
        actionTokenHash: null,
        actionTokenExpires: null,
      },
      $push: {
        history: {
          event: "declined",
          at: new Date(),
          athleteName: slot.athleteName,
          parentName: slot.parentName,
          parentEmail: slot.parentEmail,
          parentPhone: slot.parentPhone,
          packageType: slot.packageType,
        },
      },
    }
  );
  if (!declined) return null;
  await sendParentDeclineEmail(declined);
  return declined;
}

/**
 * GET /api/lesson-requests/action?token=X
 * Public, read-only — summary for the confirm/decline landing page. Never
 * mutates, so it's safe against email link-prescanners.
 */
const getActionSummary = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ message: "Missing token" });

  try {
    const slot = await LessonRequestSlot.findOne({
      actionTokenHash: hashToken(token),
      actionTokenExpires: { $gt: new Date() },
      status: "requested",
    }).select("+actionTokenHash");

    if (!slot) {
      return res.status(404).json({ message: "This link is invalid or has already been used." });
    }

    return res.json({
      athleteName: slot.athleteName,
      parentName: slot.parentName,
      parentEmail: slot.parentEmail,
      parentPhone: slot.parentPhone,
      packageType: slot.packageType,
      packageLabel: PACKAGE_LABELS[slot.packageType],
      dayOfWeek: slot.dayOfWeek,
      timeLabel: slot.timeLabel,
      location: slot.location,
    });
  } catch (err) {
    console.error("Get lesson request action summary error:", err);
    return res.status(500).json({ message: "Failed to load request" });
  }
};

/**
 * POST /api/lesson-requests/action  { token, action: "confirm" | "decline" }
 * Public (token-authenticated) — the actual state-changing step, triggered
 * by a button tap on the landing page (never a bare GET link — see plan for
 * why: email link-prescanners could otherwise burn the token before a human
 * ever clicks it).
 */
const applyAction = async (req, res) => {
  const { token, action } = req.body;
  if (!token || !["confirm", "decline"].includes(action)) {
    return res.status(400).json({ message: "Invalid request" });
  }

  try {
    const slot = await LessonRequestSlot.findOne({
      actionTokenHash: hashToken(token),
      actionTokenExpires: { $gt: new Date() },
      status: "requested",
    }).select("+actionTokenHash");

    if (!slot) {
      return res.status(404).json({ message: "This link is invalid or has already been used." });
    }

    const result = action === "confirm" ? await applyConfirm(slot, null) : await applyDecline(slot);

    if (!result) {
      return res.status(409).json({ message: "This request was already handled." });
    }

    return res.json({ status: action === "confirm" ? "confirmed" : "declined" });
  } catch (err) {
    console.error("Apply lesson request action error:", err);
    return res.status(500).json({ message: "Failed to process request" });
  }
};

/**
 * GET /api/lesson-requests?view=open|requested|confirmed
 * Admin dashboard list.
 */
const listAll = async (req, res) => {
  const { view } = req.query;
  const filter = {};
  if (["open", "requested", "confirmed"].includes(view)) filter.status = view;

  try {
    const slots = await LessonRequestSlot.find(filter).sort({ dayOfWeek: 1, startTime: 1 });
    return res.json(slots);
  } catch (err) {
    console.error("List lesson requests error:", err);
    return res.status(500).json({ message: "Failed to fetch lesson requests" });
  }
};

const confirmRequest = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

  try {
    const slot = await LessonRequestSlot.findOne({ _id: id, status: "requested" });
    if (!slot) return res.status(409).json({ message: "This request was already handled." });

    const result = await applyConfirm(slot, req.user._id);
    if (!result) return res.status(409).json({ message: "This request was already handled." });
    return res.json(result);
  } catch (err) {
    console.error("Confirm lesson request error:", err);
    return res.status(500).json({ message: "Failed to confirm request" });
  }
};

const declineRequest = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

  try {
    const slot = await LessonRequestSlot.findOne({ _id: id, status: "requested" });
    if (!slot) return res.status(409).json({ message: "This request was already handled." });

    const result = await applyDecline(slot);
    if (!result) return res.status(409).json({ message: "This request was already handled." });
    return res.json(result);
  } catch (err) {
    console.error("Decline lesson request error:", err);
    return res.status(500).json({ message: "Failed to decline request" });
  }
};

const updatePaymentStatus = async (req, res) => {
  const { id } = req.params;
  const { paymentStatus } = req.body;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });
  if (!["not_invoiced", "invoiced", "paid"].includes(paymentStatus)) {
    return res.status(400).json({ message: "Invalid payment status" });
  }

  try {
    const slot = await LessonRequestSlot.findByIdAndUpdate(
      id,
      { paymentStatus },
      { new: true, runValidators: true }
    );
    if (!slot) return res.status(404).json({ message: "Not found" });
    return res.json(slot);
  } catch (err) {
    console.error("Update lesson request payment status error:", err);
    return res.status(400).json({ message: err.message });
  }
};

/**
 * POST /api/lesson-requests/slots
 * Admin — define a new recurring weekly slot (Allie's replacement for
 * manually adding a row to the Sheet).
 */
const createSlot = async (req, res) => {
  const { dayOfWeek, location, startTime, endTime, timeLabel } = req.body;
  if (!dayOfWeek || !startTime || !endTime || !timeLabel) {
    return res
      .status(400)
      .json({ message: "dayOfWeek, startTime, endTime, and timeLabel are required" });
  }

  try {
    const slot = await LessonRequestSlot.create({
      dayOfWeek,
      location: location || "Advanced Player Academy Waldwick, NJ",
      startTime,
      endTime,
      timeLabel,
    });
    return res.status(201).json(slot);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "A slot with this day/location/time already exists" });
    }
    console.error("Create lesson slot definition error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const SLOT_EDITABLE_FIELDS = ["dayOfWeek", "location", "startTime", "endTime", "timeLabel"];

const updateSlot = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

  try {
    const slot = await LessonRequestSlot.findById(id);
    if (!slot) return res.status(404).json({ message: "Not found" });
    if (slot.status !== "open") {
      return res
        .status(409)
        .json({ message: "Decline or confirm this request before editing the slot." });
    }

    const updates = {};
    SLOT_EDITABLE_FIELDS.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const updated = await LessonRequestSlot.findByIdAndUpdate(id, updates, {
      new: true,
      runValidators: true,
    });
    return res.json(updated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "A slot with this day/location/time already exists" });
    }
    console.error("Update lesson slot definition error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const deleteSlot = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ message: "Invalid id" });

  try {
    const slot = await LessonRequestSlot.findById(id);
    if (!slot) return res.status(404).json({ message: "Not found" });
    if (slot.status !== "open") {
      return res
        .status(409)
        .json({ message: "Decline or confirm this request before deleting the slot." });
    }
    await LessonRequestSlot.findByIdAndDelete(id);
    return res.json({ deleted: true });
  } catch (err) {
    console.error("Delete lesson slot definition error:", err);
    return res.status(500).json({ message: "Failed to delete slot" });
  }
};

module.exports = {
  listOpenSlots,
  listScheduleOverview,
  createRequest,
  getActionSummary,
  applyAction,
  listAll,
  confirmRequest,
  declineRequest,
  updatePaymentStatus,
  createSlot,
  updateSlot,
  deleteSlot,
  PACKAGE_LABELS,
  PACKAGE_PAYMENT_LINK_ENV,
};
