const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
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
    dateOfBirth: { type: Date, required: true },
    emergencyName: { type: String, required: true, trim: true, maxlength: 120 },
    emergencyPhone: { type: String, required: true, trim: true, maxlength: 30 }
  },
  { timestamps: true }
);

UserSchema.index({ email: 1 }, { unique: true });

module.exports = mongoose.model("User", UserSchema);

