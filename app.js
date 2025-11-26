require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const connectDB = require("./db");
const authRoutes = require("./routes/auth");
const scheduleRoutes = require("./routes/schedule");

const app = express();
const { PORT = 8080 } = process.env;

// ---------------------------
// 🌟 CRITICAL: CLOUD RUN CORS
// ---------------------------

const FRONTEND_URL = "http://localhost:5173";

// Preflight handler (Cloud Run requires this)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", FRONTEND_URL);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.status(204).send(""); // Must send empty 204 response
  }

  next();
});

// Backup CORS middleware (for non-preflight requests)
app.use(
  cors({
    origin: FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  })
);

app.use(express.json());

// ---------------------------
// Connect DB
// ---------------------------
connectDB();

// ---------------------------
// Routes
// ---------------------------
app.use("/", authRoutes);
app.use("/api", scheduleRoutes);
app.use("/uploads/avatars/", express.static("uploads/avatars/"));
// ---------------------------
// Start server
// ---------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
