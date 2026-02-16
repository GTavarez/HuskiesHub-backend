require("dotenv").config();
const mongoose = require("mongoose");
const Player = require("../models/Player");
const Team = require("../models/Team");
const { connectDB } = require("../db");
const defaultImage = "default";

// 👇 PUT YOUR PLAYERS HERE (from frontend constants)
const players = [
  {
    name: "Antonella Sottile",
    jersey: 1,
    position: "P, CF",
    gradYear: 2026,
    highSchool: "Immaculate Heart Academy",
    GPA: "3.8",
    image: "as.jpg",
  },

  {
    name: "Ana Feliciano",
    jersey: 5,
    position: "",
    gradYear: 2027,
    highSchool: "Pompton Lakes High School",
    GPA: 3.79,
    image: defaultImage,
  },
  {
    name: "Sofia Rocha",
    jersey: 14,
    position: "OF",
    gradYear: 2026,
    highSchool: "Nutley High School",
    GPA: 3.4,
    image: "sr.jpg",
  },
  {
    name: "Gabriella Brieva",
    jersey: 24,
    position: "C, 3B",
    gradYear: 2028,
    highSchool: "Wanaque High School",
    GPA: "",
    image: "gb.jpg",
  },
  {
    name: "Ashley Witkowski",
    jersey: 2,
    position: "IF, OF",
    gradYear: 2027,
    highSchool: "Pascack Valley High School",
    GPA: 4.0,
    image: "aw.jpg",
  },
  {
    name: "Emilia Kelley",
    jersey: 10,
    position: "C, OF",
    gradYear: 2026,
    highSchool: "Ridgewood High School",
    GPA: 3.5,
    image: "ek.jpg",
  },
  {
    name: "Izzy Marut",
    jersey: 16,
    position: "OF",
    gradYear: 2028,
    highSchool: "Butler High School",
    GPA: 3.8,
    image: "im.jpg",
  },
  {
    name: "Jordyn Struyk",
    jersey: 99,
    position: "OF, IF",
    gradYear: 2029,
    highSchool: "High School",
    GPA: "",
    image: "js.jpg",
  },
  {
    name: "Lexi Feliciano",
    jersey: 4,
    position: "",
    gradYear: 2027,
    highSchool: "Pompton Lakes High School",
    GPA: 3.5,
    image: "lf.jpg",
  },
  {
    name: "Kylee Bianchini",
    jersey: 13,
    position: "1B, 3B",
    gradYear: 2026,
    highSchool: "Wayne Valley High School",
    GPA: 3.3,
    image: "kb.jpg",
  },
  {
    name: "Natalie Davis",
    jersey: 17,
    position: "OF",
    gradYear: 2026,
    highSchool: "Fair Lawn High School",
    GPA: 3.8,
    image: "nd.jpg",
  },
  {
    name: "Arianna Morran",
    jersey: 12,
    position: "P",
    gradYear: 2027,
    highSchool: "West Milford High School",
    GPA: 3.5,
    image: "am.jpg",
  },
];

async function seed() {
  try {
    await connectDB();

    // 🔍 find the team by name (safer than hardcoding ID)
    const TEAM_ID = "695d3b42510e717bb7cca3e1";
    const team = await Team.findOne({ name: "18U Premier" });

    if (!team) {
      throw new Error("Team not found. Create the team first.");
    }
    console.log("✅ Found team:", team._id.toString(), team.name);
    await Player.deleteMany({ teamId: team._id });
    console.log("🧹 Cleared existing players for team");
    // 🔁 attach teamId to every player
    const playersWithTeam = players.map((p) => ({
      ...p,
      teamId: team._id,
    }));

    // ❗ optional: clear existing players for that team
    await Player.deleteMany({ teamId: team._id });

    // ✅ insert players
    await Player.insertMany(playersWithTeam);
    console.log("➡️ Inserting players:", playersWithTeam);
    const inserted = await Player.insertMany(playersWithTeam);
    console.log("✅ Inserted count:", inserted.length);

    console.log("✅ Players seeded successfully");
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  }
}

seed();
