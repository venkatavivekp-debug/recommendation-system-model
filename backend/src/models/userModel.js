const dataStore = require('./dataStore');

async function getAllUsers() {
  const data = await dataStore.readData();
  return data.users;
}

async function findUserByEmail(email) {
  const data = await dataStore.readData();
  return data.users.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
}

async function findUserById(userId) {
  const data = await dataStore.readData();
  return data.users.find((user) => user.id === userId) || null;
}

async function createUser(userPayload) {
  await dataStore.updateData((data) => {
    data.users.push(userPayload);
    return data;
  });

  return userPayload;
}

async function updateUserById(userId, fields) {
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
