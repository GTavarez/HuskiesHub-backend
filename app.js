// app.js
require("dotenv").config();
const express = require("express");
const { connectDB } = require("./db");
const http = require("http");
const { Server } = require("socket.io");

// ROUTES
const authRoutes = require("./routes/auth");
const scheduleRoutes = require("./routes/schedule"); // ✅ router from schedule.js
const adminRoutes = require("./routes/admin");
const imagesRoutes = require("./routes/images");
const uploadsRoutes = require("./routes/uploads");
const messagesRoutes = require("./routes/messages");
const teamsRoutes = require("./routes/teams");
const chatSocket = require("./sockets/chat");
const playersRoutes = require("./routes/players");
const app = express();
const PORT = process.env.PORT || 8080;
const socketMiddlewares = require("./middlewares/sockets");
// ---- BODY PARSERS ----
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---- CORS ----
const ALLOWED_ORIGINS = [
  "http://localhost:5174",
  "http://localhost:5173",
  "https://www.eshuskiesyoffee.com",
  "http://eshuskiesyoffee.com",
  "https://huskieshub-frontend-891073803869.us-central1.run.app",
];

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

app.use("/api", uploadsRoutes);
app.use("/images", imagesRoutes);
app.use("/admin", adminRoutes);
app.use("/", authRoutes);
app.use("/api/messages", messagesRoutes);
app.use("/api/teams", teamsRoutes);
app.use("/api/players", playersRoutes);

// Debug: Confirm backend is alive
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// ---- EXPORT APP ----
module.exports = app;
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://eshuskiesyoffee.com",
    ],
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
      console.log("⏳ Connecting to MongoDB...");
      await connectDB();
      console.log("🔥 Mongo connected — starting server");

      server.listen(PORT, "0.0.0.0", () => {
        console.log(`🚀 Server running at http://localhost:${PORT}`);
      });
    } catch (err) {
      console.error("❌ Failed to start server:", err);
    }
  })();
}
