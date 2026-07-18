const mongoose = require("mongoose");

// Purely admin-tracked — no live hotel-booking API integration. Same tier as
// how Documents/Waivers are tracked today: informational, not transactional.
const hotelReservationSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tournament",
      required: true,
    },
    hotelName: { type: String, required: true },
    confirmationNumber: { type: String, default: "" },
    checkIn: { type: Date, required: true },
    checkOut: { type: Date, required: true },
    roomCount: { type: Number, default: 1, min: 1 },
    costCents: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled"],
      default: "pending",
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

hotelReservationSchema.index({ tournamentId: 1 });
hotelReservationSchema.index({ status: 1 });

module.exports =
  mongoose.models.HotelReservation ||
  mongoose.model("HotelReservation", hotelReservationSchema);
