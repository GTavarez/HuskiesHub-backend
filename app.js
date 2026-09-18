// app.js
require("dotenv").config();
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");
const { connectDB } = require("./db");

// ROUTES
const usersRoutes = require("./src/modules/users/routes");
const scheduleRoutes = require("./src/modules/schedule/routes"); // ✅ router from schedule.js
const mediaRoutes = require("./src/modules/media/routes");
const contactRoutes = require("./src/modules/contact/routes");
const messagesRoutes = require("./src/modules/messages/routes");
const conversationsRoutes = require("./src/modules/conversations/routes");
const teamsRoutes = require("./src/modules/teams/routes");
const playersRoutes = require("./src/modules/players/routes");
const eventsRoutes = require("./src/modules/events/routes");
const attendanceRoutes = require("./src/modules/attendance/routes");
const announcementsRoutes = require("./src/modules/announcements/routes");
const documentsRoutes = require("./src/modules/documents/routes");
const playerNotesRoutes = require("./src/modules/player-notes/routes");
const paymentsRoutes = require("./src/modules/payments/routes");
const paymentsWebhookRoutes = require("./src/modules/payments/webhookRoutes");
const productsRoutes = require("./src/modules/products/routes");
const waiversRoutes = require("./src/modules/waivers/routes");
const waiverSignaturesRoutes = require("./src/modules/waiver-signatures/routes");
const registrationsRoutes = require("./src/modules/registrations/routes");
const recruitingProfilesRoutes = require("./src/modules/recruiting-profiles/routes");
const performanceRoutes = require("./src/modules/performance/routes");
const tournamentsRoutes = require("./src/modules/tournaments/routes");
const hotelReservationsRoutes = require("./src/modules/tournaments/hotelRoutes");
const payrollRoutes = require("./src/modules/payroll/routes");
const lessonSlotsRoutes = require("./src/modules/lesson-slots/routes");
const lessonRequestsRoutes = require("./src/modules/lesson-requests/routes");
const analyticsRoutes = require("./src/modules/analytics/routes");
const aiAssistantRoutes = require("./src/modules/ai-assistant/routes");
const notificationsRoutes = require("./src/modules/notifications/routes");
const cetAssessmentRoutes = require("./src/modules/cet-assessment/routes");
const cetAssessmentWebhookRoutes = require("./src/modules/cet-assessment/webhookRoutes");
const chatSocket = require("./src/sockets/chat");

const app = express();
const PORT = process.env.PORT || 8080;
const socketMiddlewares = require("./src/common/middlewares/sockets");

// Stripe webhook needs the RAW request body for signature verification, so it
// must be mounted with express.raw() before the global express.json() below
// consumes the stream. No auth/requireRole here — Stripe signs the request.
app.use(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  paymentsWebhookRoutes
);
app.use(
  "/api/cet-assessment/webhook",
  express.raw({ type: "application/json" }),
  cetAssessmentWebhookRoutes
);

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://www.eshuskiesyoffee.com",
  "https://eshuskiesyoffee.com",
  "http://eshuskiesyoffee.com",
  "https://huskieshub-frontend-891073803869.us-central1.run.app",
];

const ALLOWED_ORIGINS = (
  process.env.CORS_ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(",")
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
// ---- BODY PARSERS ----
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ---- CORS ----
app.use((req, res, next) => {
  const { origin } = req.headers;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  }

  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

// ---- ROUTES ----

app.use("/api", scheduleRoutes); // ✅ gives you GET /api/schedule
app.use("/", mediaRoutes); // owns POST /admin, POST/GET /images*, GET /api/uploads/:id
app.use("/api/contact", contactRoutes);
app.use("/", usersRoutes); // /signup, /signin, /me
app.use("/api/messages", messagesRoutes);
app.use("/api/conversations", conversationsRoutes);
app.use("/api/teams", teamsRoutes);
app.use("/api/players", playersRoutes);
app.use("/api/events", eventsRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/announcements", announcementsRoutes);
app.use("/api/documents", documentsRoutes);
app.use("/api/player-notes", playerNotesRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/products", productsRoutes);
app.use("/api/waivers", waiversRoutes);
app.use("/api/waiver-signatures", waiverSignaturesRoutes);
app.use("/api/registrations", registrationsRoutes);
app.use("/api/recruiting-profiles", recruitingProfilesRoutes);
app.use("/api/performance", performanceRoutes);
app.use("/api/tournaments", tournamentsRoutes);
app.use("/api/hotel-reservations", hotelReservationsRoutes);
app.use("/api/payroll", payrollRoutes);
app.use("/api/lesson-slots", lessonSlotsRoutes);
app.use("/api/lesson-requests", lessonRequestsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/cet-assessment", cetAssessmentRoutes);
app.use("/api/ai-assistant", aiAssistantRoutes);

// Debug: Confirm backend is alive
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// Catches multer upload failures (oversized file, wrong file type) that
// would otherwise bubble up as an unhandled crash — a bare 500 with no body,
// instead of a message the frontend can actually show the user. Must be
// registered after every route (Express only treats a 4-arg handler as an
// error handler) and last, since it's a catch-all for anything else that
// slips through a route's own try/catch too.
const multer = require("multer");
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "That file is too large."
        : err.message;
    return res.status(400).json({ message });
  }
  if (err) {
    console.error("Unhandled error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
  return next();
});

// ---- EXPORT APP ----
module.exports = app;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
});
io.use(socketMiddlewares);
chatSocket(io);
// basic test
io.on("connection", (socket) => {
  console.log("🟢 Socket connected:", socket.id);
});

// ---- START SERVER ONLY IF RUN DIRECTLY ----
if (require.main === module) {
  (async () => {
    try {
      console.log("Connecting to MongoDB...");
      await connectDB();
      console.log("Mongo connected; starting server");

      server.listen(PORT, "0.0.0.0", () => {
        console.log(`Server running on port ${PORT}`);
      });
    } catch (err) {
      console.error("Failed to start server:", err);
    }
  })();
}
