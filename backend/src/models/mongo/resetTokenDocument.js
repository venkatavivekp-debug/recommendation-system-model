const mongoose = require('mongoose');

const resetTokenSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: String, required: true },
    used: { type: Boolean, default: false },
    usedAt: { type: String, default: null },
    createdAt: { type: String, required: true },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.ResetTokenDocument ||
  mongoose.model('ResetTokenDocument', resetTokenSchema);
