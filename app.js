require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const connectDB = require("./db");
const authRoutes = require("./routes/auth");
const scheduleRoutes = require("./routes/schedule");

const app = express();
const { PORT = 8080 } = process.env;

// --------------------------------------------
// ⭐ Allowed Domains
// --------------------------------------------
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "https://www.eshuskiesyoffee.com",
  "http://eshuskiesyoffee.com",
  "https://huskieshub-frontend-891073803869.us-central1.run.app",
];

// --------------------------------------------
// ⭐ CORS + Preflight (Cloud Run safe)
// --------------------------------------------
app.use((req, res, next) => {
  const origin = req.headers.origin;

  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );

  // Required for Cloud Run
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

// Backup CORS (non-preflight)
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || ALLOWED_ORIGINS.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("CORS blocked for origin: " + origin));
      }
    },
    credentials: true,
  })
);

app.use(express.json());

// --------------------------------------------
// DB + Routes
// --------------------------------------------
connectDB();

app.use("/", authRoutes);
app.use("/api", scheduleRoutes);
app.use("/uploads/avatars/", express.static("uploads/avatars/"));

// --------------------------------------------
// Start Server
// --------------------------------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
