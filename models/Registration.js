const mongoose = require("mongoose");

const PlayerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    dateOfBirth: { type: Date, required: true },
    gender: { type: String, required: true, enum: ["male", "female"] },
    duprNR: { type: Boolean, required: true, default: false },
    dupr: { type: Number, default: null, min: 2, max: 4 }
  },
  { _id: false }
);

const RegistrationSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254
    },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    bocReferralCode: { type: String, required: true, trim: true, maxlength: 64 },

    player1: { type: PlayerSchema, required: true },
    player2: { type: PlayerSchema, required: true },

    division: { type: String, required: true, trim: true },
    tournamentName: { type: String, required: true, trim: true },
    tournamentDate: { type: String, required: true, trim: true },
    tournamentLocation: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, maxlength: 500 },

    consentAccepted: { type: Boolean, required: true, default: false },
    consentAcceptedAt: { type: Date, default: null },

    emailSentAt: { type: Date, default: null },
    emailSendError: { type: String, default: "" }
  },
  { timestamps: true }
);

RegistrationSchema.index(
  { email: 1, tournamentName: 1, division: 1 },
  { unique: true }
);

module.exports = mongoose.model("Registration", RegistrationSchema);
