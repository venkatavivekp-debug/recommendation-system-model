const { isMongoEnabled } = require('../config/database');
const ResetTokenDocument = require('./mongo/resetTokenDocument');
const dataStore = require('./dataStore');

async function createResetToken(record) {
  if (isMongoEnabled()) {
    const created = await ResetTokenDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.passwordResetTokens.push(record);
    return data;
  });

  return record;
}

async function findValidToken(tokenHash) {
  const now = new Date();

  if (isMongoEnabled()) {
    return ResetTokenDocument.findOne({
      tokenHash,
      used: false,
      expiresAt: { $gt: now.toISOString() },
    }).lean();
  }

  const data = await dataStore.readData();

  return (
    data.passwordResetTokens.find((token) => {
      return token.tokenHash === tokenHash && !token.used && new Date(token.expiresAt) > now;
    }) || null
  );
}

async function markTokenAsUsed(tokenId) {
  if (isMongoEnabled()) {
    await ResetTokenDocument.findOneAndUpdate(
      { id: tokenId },
      {
        used: true,
        usedAt: new Date().toISOString(),
      }
    );
    return;
  }

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
  if (isMongoEnabled()) {
    const now = new Date().toISOString();
    await ResetTokenDocument.deleteMany({
      $or: [{ used: true }, { expiresAt: { $lte: now } }],
    });
    return;
  }

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
