const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const messageModel = require('../models/messageModel');
const friendService = require('./friendService');
const userService = require('./userService');

const ALLOWED_MESSAGE_TYPES = new Set(['text', 'recipe', 'diet', 'workout']);

function normalizeMessageType(value) {
  const normalized = String(value || 'text').trim().toLowerCase();
  if (!ALLOWED_MESSAGE_TYPES.has(normalized)) {
    throw new AppError('type must be text, recipe, diet, or workout', 400, 'VALIDATION_ERROR');
  }
  return normalized;
}

async function assertCanChat(senderId, receiverId) {
  if (senderId === receiverId) {
    throw new AppError('You cannot send a chat message to yourself', 400, 'VALIDATION_ERROR');
  }

  const [sender, receiver, areFriends] = await Promise.all([
    userService.getUserById(senderId),
    userService.getUserById(receiverId),
    friendService.areFriends(senderId, receiverId),
  ]);

  if (!sender || !receiver) {
    throw new AppError('Chat user not found', 404, 'NOT_FOUND');
  }

  if (!areFriends) {
    throw new AppError('Chat is available only between friends', 403, 'FORBIDDEN');
  }

  return {
    sender,
    receiver,
  };
}

function mapMessage(row, currentUserId, peerById = new Map()) {
  const peerId = row.senderId === currentUserId ? row.receiverId : row.senderId;
  const peer = peerById.get(peerId);
  return {
    id: row.id,
    senderId: row.senderId,
    receiverId: row.receiverId,
    content: row.content,
    type: row.type || 'text',
    createdAt: row.createdAt,
    peer:
      peer && peer.id
        ? {
            id: peer.id,
            firstName: peer.firstName,
            lastName: peer.lastName,
            email: peer.email,
          }
        : null,
  };
}

async function sendMessage(senderId, payload) {
  const receiverId = String(payload.receiverId || '').trim();
  const content = String(payload.content || '').trim();
  const type = normalizeMessageType(payload.type);

  if (!receiverId) {
    throw new AppError('receiverId is required', 400, 'VALIDATION_ERROR');
  }
  if (content.length < 1 || content.length > 1200) {
    throw new AppError('content must be between 1 and 1200 characters', 400, 'VALIDATION_ERROR');
  }

  await assertCanChat(senderId, receiverId);

  const message = await messageModel.createMessage({
    id: randomUUID(),
    senderId,
    receiverId,
    content,
    type,
    createdAt: new Date().toISOString(),
  });

  return {
    message: mapMessage(message, senderId),
  };
}

async function listMessages(userId, peerUserId, limit = 200) {
  const peerId = String(peerUserId || '').trim();
  if (!peerId) {
    throw new AppError('peerUserId is required', 400, 'VALIDATION_ERROR');
  }

  await assertCanChat(userId, peerId);

  const rows = await messageModel.listConversationMessages(userId, peerId, limit);
  const peer = await userService.getUserById(peerId);
  const peerById = new Map(peer ? [[peer.id, peer]] : []);

  return {
    peer: peer ? userService.sanitizeUser(peer) : null,
    messages: rows
      .slice()
      .reverse()
      .map((row) => mapMessage(row, userId, peerById)),
    total: rows.length,
  };
}

module.exports = {
  sendMessage,
  listMessages,
};
