const mongoose = require("mongoose");
const Tournament = require("./model");
const HotelReservation = require("./hotelReservationModel");

const createTournament = async (req, res) => {
  const { name, startDate, endDate, location, teamIds } = req.body;

  if (!name || !startDate || !endDate) {
    return res.status(400).json({ message: "name, startDate, and endDate are required" });
  }

  try {
    const tournament = await Tournament.create({
      name,
      startDate,
      endDate,
      location,
      teamIds: teamIds || [],
      createdBy: req.user._id,
    });
    return res.status(201).json(tournament);
  } catch (err) {
    console.error("Create tournament error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const listTournaments = async (req, res) => {
  try {
    const tournaments = await Tournament.find().sort({ startDate: 1 });
    return res.json(tournaments);
  } catch (err) {
    console.error("List tournaments error:", err);
    return res.status(500).json({ message: "Failed to fetch tournaments" });
  }
};

const getTournament = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid tournament id" });
  }

  try {
    const tournament = await Tournament.findById(id);
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });
    return res.json(tournament);
  } catch (err) {
    console.error("Get tournament error:", err);
    return res.status(500).json({ message: "Failed to fetch tournament" });
  }
};

const updateTournament = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid tournament id" });
  }

  const { name, startDate, endDate, location, teamIds, status } = req.body;

  try {
    const tournament = await Tournament.findByIdAndUpdate(
      id,
      { name, startDate, endDate, location, teamIds, status },
      { new: true, runValidators: true }
    );
    if (!tournament) return res.status(404).json({ message: "Tournament not found" });
    return res.json(tournament);
  } catch (err) {
    console.error("Update tournament error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const createHotelReservation = async (req, res) => {
  const { id: tournamentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
    return res.status(400).json({ message: "Invalid tournament id" });
  }

  const { hotelName, confirmationNumber, checkIn, checkOut, roomCount, costCents } = req.body;
  if (!hotelName || !checkIn || !checkOut) {
    return res.status(400).json({ message: "hotelName, checkIn, and checkOut are required" });
  }

  try {
    const reservation = await HotelReservation.create({
      tournamentId,
      hotelName,
      confirmationNumber,
      checkIn,
      checkOut,
      roomCount,
      costCents,
      createdBy: req.user._id,
    });
    return res.status(201).json(reservation);
  } catch (err) {
    console.error("Create hotel reservation error:", err);
    return res.status(400).json({ message: err.message });
  }
};

const listHotelReservationsForTournament = async (req, res) => {
  const { id: tournamentId } = req.params;
  if (!mongoose.Types.ObjectId.isValid(tournamentId)) {
    return res.status(400).json({ message: "Invalid tournament id" });
  }

  try {
    const reservations = await HotelReservation.find({ tournamentId }).sort({ checkIn: 1 });
    return res.json(reservations);
  } catch (err) {
    console.error("List hotel reservations error:", err);
    return res.status(500).json({ message: "Failed to fetch hotel reservations" });
  }
};

module.exports = {
  createTournament,
  listTournaments,
  getTournament,
  updateTournament,
  createHotelReservation,
  listHotelReservationsForTournament,
};
