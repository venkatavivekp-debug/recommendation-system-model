const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    senderId: { type: String, required: true, index: true },
    receiverId: { type: String, required: true, index: true },
    content: { type: String, required: true },
    type: { type: String, default: 'text' },
    createdAt: { type: String, required: true, index: true },
  },
  { versionKey: false }
);

module.exports =
  mongoose.models.MessageDocument || mongoose.model('MessageDocument', messageSchema);
