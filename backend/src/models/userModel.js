const { isMongoEnabled } = require('../config/database');
const UserDocument = require('./mongo/userDocument');
const dataStore = require('./dataStore');

async function getAllUsers() {
  if (isMongoEnabled()) {
    return UserDocument.find({}).lean();
  }

  const data = await dataStore.readData();
  return data.users;
}

async function findUserByEmail(email) {
  if (isMongoEnabled()) {
    return UserDocument.findOne({ email: email.toLowerCase() }).lean();
  }

  const data = await dataStore.readData();
  return data.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findUserById(userId) {
  if (isMongoEnabled()) {
    return UserDocument.findOne({ id: userId }).lean();
  }

  const data = await dataStore.readData();
  return data.users.find((user) => user.id === userId) || null;
}

async function createUser(userPayload) {
  if (isMongoEnabled()) {
    const created = await UserDocument.create(userPayload);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.users.push(userPayload);
    return data;
  });

  return userPayload;
}

async function updateUserById(userId, fields) {
  if (isMongoEnabled()) {
    return UserDocument.findOneAndUpdate(
      { id: userId },
      {
        ...fields,
        updatedAt: new Date().toISOString(),
      },
      { new: true }
    ).lean();
  }

  let updatedUser = null;

  await dataStore.updateData((data) => {
    const userIndex = data.users.findIndex((user) => user.id === userId);
    if (userIndex === -1) {
      return data;
    }

    data.users[userIndex] = {
      ...data.users[userIndex],
      ...fields,
      updatedAt: new Date().toISOString(),
    };

    updatedUser = data.users[userIndex];
    return data;
  });

  return updatedUser;
}

async function replaceAllUsers(users) {
  if (isMongoEnabled()) {
    await UserDocument.deleteMany({});
    if (users.length) {
      await UserDocument.insertMany(users);
    }

    return users;
  }

  await dataStore.updateData((data) => {
    data.users = users;
    return data;
  });

  return users;
}

module.exports = {
  getAllUsers,
  findUserByEmail,
  findUserById,
  createUser,
  updateUserById,
  replaceAllUsers,
};
