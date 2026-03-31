const mongoose = require('mongoose');

const friendSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    friendId: { type: String, required: true, index: true },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

friendSchema.index({ userId: 1, friendId: 1 }, { unique: true });

module.exports = mongoose.models.FriendDocument || mongoose.model('FriendDocument', friendSchema);
