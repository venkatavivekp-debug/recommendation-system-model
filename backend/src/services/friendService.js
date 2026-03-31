const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const friendRequestModel = require('../models/friendRequestModel');
const friendModel = require('../models/friendModel');
const userService = require('./userService');

function userPreview(user) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
  };
}

async function getFriendIdSet(userId) {
  const links = await friendModel.listFriendsByUser(userId, 1000);
  return new Set(links.map((item) => item.friendId));
}

async function areFriends(userAId, userBId) {
  if (!userAId || !userBId) {
    return false;
  }
  return friendModel.areUsersFriends(userAId, userBId);
}

async function sendFriendRequest(senderId, payload) {
  const sender = await userService.getUserOrThrow(senderId);
  const receiver = payload.receiverId
    ? await userService.getUserOrThrow(payload.receiverId)
    : await userService.getUserByEmail(String(payload.receiverEmail || '').toLowerCase());

  if (!receiver) {
    throw new AppError('Target user not found', 404, 'NOT_FOUND');
  }
  if (receiver.id === sender.id) {
    throw new AppError('You cannot send a friend request to yourself', 400, 'VALIDATION_ERROR');
  }

  const [existingFriendship, pending] = await Promise.all([
    areFriends(sender.id, receiver.id),
    friendRequestModel.findPendingRequestBetweenUsers(sender.id, receiver.id),
  ]);

  if (existingFriendship) {
    throw new AppError('You are already friends with this user', 400, 'VALIDATION_ERROR');
  }
  if (pending) {
    throw new AppError('A pending friend request already exists', 400, 'VALIDATION_ERROR');
  }

  const now = new Date().toISOString();
  const request = await friendRequestModel.createFriendRequest({
    id: randomUUID(),
    senderId: sender.id,
    receiverId: receiver.id,
    status: 'PENDING',
    createdAt: now,
    updatedAt: now,
  });

  return {
    request: {
      ...request,
      sender: userPreview(sender),
      receiver: userPreview(receiver),
    },
  };
}

async function acceptFriendRequest(currentUserId, requestId) {
  const [currentUser, request] = await Promise.all([
    userService.getUserOrThrow(currentUserId),
    friendRequestModel.findFriendRequestById(requestId),
  ]);

  if (!request) {
    throw new AppError('Friend request not found', 404, 'NOT_FOUND');
  }
  if (request.receiverId !== currentUser.id) {
    throw new AppError('Only the receiver can accept this request', 403, 'FORBIDDEN');
  }
  if (request.status !== 'PENDING') {
    throw new AppError('Friend request is no longer pending', 400, 'VALIDATION_ERROR');
  }

  const now = new Date().toISOString();
  await Promise.all([
    friendModel.createFriendship({
      id: randomUUID(),
      userId: request.senderId,
      friendId: request.receiverId,
      createdAt: now,
    }),
    friendModel.createFriendship({
      id: randomUUID(),
      userId: request.receiverId,
      friendId: request.senderId,
      createdAt: now,
    }),
    friendRequestModel.updateFriendRequestById(request.id, {
      status: 'ACCEPTED',
      updatedAt: now,
    }),
  ]);

  return listFriends(currentUserId);
}

async function rejectFriendRequest(currentUserId, requestId) {
  const [currentUser, request] = await Promise.all([
    userService.getUserOrThrow(currentUserId),
    friendRequestModel.findFriendRequestById(requestId),
  ]);

  if (!request) {
    throw new AppError('Friend request not found', 404, 'NOT_FOUND');
  }
  if (request.receiverId !== currentUser.id) {
    throw new AppError('Only the receiver can reject this request', 403, 'FORBIDDEN');
  }
  if (request.status !== 'PENDING') {
    throw new AppError('Friend request is no longer pending', 400, 'VALIDATION_ERROR');
  }

  await friendRequestModel.updateFriendRequestById(request.id, {
    status: 'REJECTED',
    updatedAt: new Date().toISOString(),
  });

  return listFriendRequests(currentUserId);
}

async function listFriends(userId) {
  const [links, users] = await Promise.all([
    friendModel.listFriendsByUser(userId, 1000),
    userService.getAllUsers(),
  ]);

  const byId = new Map(users.map((item) => [item.id, item]));
  const friends = links
    .map((link) => byId.get(link.friendId))
    .filter(Boolean)
    .map(userPreview);

  return {
    friends,
    total: friends.length,
  };
}

async function listFriendRequests(userId) {
  const [rows, users] = await Promise.all([
    friendRequestModel.listFriendRequestsByUser(userId, 400),
    userService.getAllUsers(),
  ]);

  const byId = new Map(users.map((item) => [item.id, item]));
  const incoming = [];
  const outgoing = [];

  rows.forEach((row) => {
    const sender = byId.get(row.senderId);
    const receiver = byId.get(row.receiverId);
    const mapped = {
      ...row,
      sender: sender ? userPreview(sender) : null,
      receiver: receiver ? userPreview(receiver) : null,
    };

    if (row.receiverId === userId) {
      incoming.push(mapped);
    } else {
      outgoing.push(mapped);
    }
  });

  return {
    incoming,
    outgoing,
  };
}

async function searchUsersByEmail(currentUserId, query) {
  const text = String(query || '').trim().toLowerCase();
  if (text.length < 2) {
    return { users: [] };
  }

  const users = await userService.getAllUsers();
  const matches = users
    .filter((user) => user.id !== currentUserId)
    .filter((user) => String(user.email || '').toLowerCase().includes(text))
    .slice(0, 12)
    .map(userPreview);

  return {
    users: matches,
  };
}

module.exports = {
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  listFriends,
  listFriendRequests,
  searchUsersByEmail,
  areFriends,
  getFriendIdSet,
};
