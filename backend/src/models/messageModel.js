const { isMongoEnabled } = require('../config/database');
const MessageDocument = require('./mongo/messageDocument');
const dataStore = require('./dataStore');

async function createMessage(record) {
  if (isMongoEnabled()) {
    const created = await MessageDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.chatMessages = data.chatMessages || [];
    data.chatMessages.push(record);
    if (data.chatMessages.length > 12000) {
      data.chatMessages = data.chatMessages.slice(-12000);
    }
    return data;
  });

  return record;
}

async function listConversationMessages(userAId, userBId, limit = 200) {
  if (isMongoEnabled()) {
    return MessageDocument.find({
      $or: [
        { senderId: userAId, receiverId: userBId },
        { senderId: userBId, receiverId: userAId },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  const data = await dataStore.readData();
  return (data.chatMessages || [])
    .filter(
      (row) =>
        (row.senderId === userAId && row.receiverId === userBId) ||
        (row.senderId === userBId && row.receiverId === userAId)
    )
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

module.exports = {
  createMessage,
  listConversationMessages,
};
