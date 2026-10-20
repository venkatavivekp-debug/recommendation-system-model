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

async function mutateAdaptivePolicy(userId, domain, mutate) {
  if (!['food', 'fitness', 'media'].includes(domain)) throw new Error('Invalid policy domain');
  if (isMongoEnabled()) {
    const key = `adaptivePolicies.${domain}`;
    // Compare-and-swap on one domain prevents lost updates across workers.
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const user = await findUserById(userId);
      if (!user) throw new Error('Policy user not found');
      const previous = user.adaptivePolicies?.[domain];
      const revision = previous?.revision;
      const next = { ...mutate(previous), revision: (revision || 0) + 1 };
      const updated = await UserDocument.findOneAndUpdate(
        { id: userId, [`${key}.revision`]: revision === undefined ? { $exists: false } : revision },
        { $set: { [key]: next } }, { new: true }
      ).lean();
      if (updated) return next;
    }
    throw new Error('Concurrent policy update; retry feedback');
  }
  let next;
  await dataStore.updateData(data => {
    const user = data.users.find(row => row.id === userId);
    if (!user) throw new Error('Policy user not found');
    user.adaptivePolicies ||= {};
    const previous = user.adaptivePolicies[domain];
    next = { ...mutate(previous), revision: (previous?.revision || 0) + 1 };
    user.adaptivePolicies[domain] = next;
    return data;
  });
  return next;
}

module.exports = {
  getAllUsers,
  findUserByEmail,
  findUserById,
  createUser,
  updateUserById,
  replaceAllUsers,
  mutateAdaptivePolicy,
};
