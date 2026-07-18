const mongoose = require("mongoose");
const HotelReservation = require("./hotelReservationModel");

// Feeds the analytics dashboard's "Hotel Reservations" tile directly.
const listPendingHotelReservations = async (req, res) => {
  const { status } = req.query;

  try {
    const filter = status ? { status } : { status: "pending" };
    const reservations = await HotelReservation.find(filter).sort({ checkIn: 1 });
    return res.json(reservations);
  } catch (err) {
    console.error("List hotel reservations error:", err);
    return res.status(500).json({ message: "Failed to fetch hotel reservations" });
  }
};

const updateHotelReservationStatus = async (req, res) => {
  const { id } = req.params;
  const { status, confirmationNumber, costCents } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid reservation id" });
  }

  try {
    const reservation = await HotelReservation.findByIdAndUpdate(
      id,
      { status, confirmationNumber, costCents },
      { new: true, runValidators: true }
    );
    if (!reservation) return res.status(404).json({ message: "Reservation not found" });
    return res.json(reservation);
  } catch (err) {
    console.error("Update hotel reservation error:", err);
    return res.status(400).json({ message: err.message });
  }
};

module.exports = { listPendingHotelReservations, updateHotelReservationStatus };
