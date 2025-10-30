require("dotenv").config();
const { PORT = 3001 } = process.env;

const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./db");
const authRoutes = require("./routes/auth");
const { default: mongoose } = require("mongoose");
const app = express();
app.use(cors());
app.use(express.json());

// Connect to MongoDB
connectDB();

// routes
app.use("/", authRoutes);

/* // Define a simple route
app.get("/", (req, res) => {
  res.send("Welcome to the Softball Team API");
}); */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server is listening on port ${PORT}`);
});
