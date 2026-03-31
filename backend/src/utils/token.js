const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const env = require('../config/env');

function signJwt(payload) {
  return jwt.sign(payload, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

function verifyJwt(token) {
  return jwt.verify(token, env.jwtSecret);
}

function createRandomToken() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = {
  signJwt,
  verifyJwt,
  createRandomToken,
};
