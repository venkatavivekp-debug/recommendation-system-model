const crypto = require('crypto');
const env = require('../config/env');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  return crypto.createHash('sha256').update(env.cardEncryptionSecret).digest();
}

function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(payload) {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted payload format');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

function maskCardNumber(cardNumber) {
  const trimmed = String(cardNumber).replace(/\s+/g, '');
  if (trimmed.length <= 4) {
    return trimmed;
  }

  const last4 = trimmed.slice(-4);
  return `**** **** **** ${last4}`;
}

module.exports = {
  encrypt,
  decrypt,
  maskCardNumber,
};
