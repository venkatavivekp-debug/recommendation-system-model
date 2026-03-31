const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    senderId: { type: String, required: true, index: true },
    receiverId: { type: String, required: true, index: true },
    status: { type: String, required: true, default: 'PENDING', index: true },
    createdAt: { type: String, required: true, index: true },
    updatedAt: { type: String, required: true },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.FriendRequestDocument ||
  mongoose.model('FriendRequestDocument', friendRequestSchema);
