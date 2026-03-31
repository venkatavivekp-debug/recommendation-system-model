const mongoose = require('mongoose');

const dietShareSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    senderId: { type: String, required: true, index: true },
    targetUserId: { type: String, required: true, index: true },
    mode: { type: String, required: true, default: 'day' },
    date: { type: String, default: null },
    weekStart: { type: String, default: null },
    message: { type: String, default: '' },
    snapshot: { type: Object, default: {} },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.DietShareDocument ||
  mongoose.model('DietShareDocument', dietShareSchema);
