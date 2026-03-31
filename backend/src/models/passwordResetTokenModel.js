const dataStore = require('./dataStore');

async function createResetToken(record) {
  await dataStore.updateData((data) => {
    data.passwordResetTokens.push(record);
    return data;
  });

  return record;
}

async function findValidToken(tokenHash) {
  const data = await dataStore.readData();
  const now = new Date();

  return (
    data.passwordResetTokens.find((token) => {
      return token.tokenHash === tokenHash && !token.used && new Date(token.expiresAt) > now;
    }) || null
  );
}

async function markTokenAsUsed(tokenId) {
  await dataStore.updateData((data) => {
    const token = data.passwordResetTokens.find((item) => item.id === tokenId);
    if (token) {
      token.used = true;
      token.usedAt = new Date().toISOString();
    }
    return data;
  });
}

async function cleanupExpiredTokens() {
  await dataStore.updateData((data) => {
    const now = new Date();
    data.passwordResetTokens = data.passwordResetTokens.filter(
      (token) => !token.used && new Date(token.expiresAt) > now
    );
    return data;
  });
}

module.exports = {
  createResetToken,
  findValidToken,
  markTokenAsUsed,
  cleanupExpiredTokens,
};
