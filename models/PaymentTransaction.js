const mongoose = require("mongoose");

const PaymentTransactionSchema = new mongoose.Schema(
  {
    registration: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Registration",
      required: true,
      index: true
    },
    stripeCheckoutSessionId: { type: String, required: true, trim: true, unique: true },
    stripePaymentIntentId: { type: String, trim: true, default: "" },
    amountCents: { type: Number, required: true, min: 1 },
    currency: { type: String, required: true, trim: true, lowercase: true, maxlength: 8 },
    status: {
      type: String,
      required: true,
      enum: ["pending", "paid", "expired", "failed"],
      default: "pending",
      index: true
    },
    checkoutUrl: { type: String, trim: true, default: "" },
    paidAt: { type: Date, default: null },
    paymentEmailSentAt: { type: Date, default: null },
    paymentEmailSendError: { type: String, default: "" },
    lastWebhookEventId: { type: String, trim: true, default: "" },
    /** Stripe webhook 付款成功後寄出之收據／invoice 電郵 */
    invoiceEmailSentAt: { type: Date, default: null },
    invoiceEmailSendError: { type: String, default: "" }
  },
  { timestamps: true }
);

PaymentTransactionSchema.index({ registration: 1, createdAt: -1 });

module.exports = mongoose.model("PaymentTransaction", PaymentTransactionSchema);
