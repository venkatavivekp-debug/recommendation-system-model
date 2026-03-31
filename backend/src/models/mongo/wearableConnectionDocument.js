const mongoose = require('mongoose');

const wearableConnectionSchema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true },
    provider: { type: String, required: true, index: true },
    connected: { type: Boolean, default: true },
    syncedAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

wearableConnectionSchema.index({ userId: 1, provider: 1 }, { unique: true });

module.exports =
  mongoose.models.WearableConnectionDocument ||
  mongoose.model('WearableConnectionDocument', wearableConnectionSchema);
