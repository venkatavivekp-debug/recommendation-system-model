const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: toNumber(process.env.PORT, 5050),
  googleApiKey: process.env.GOOGLE_API_KEY || '',
  mongodbUri: process.env.MONGODB_URI || '',
  mongodbDbName: process.env.MONGODB_DB_NAME || 'food_fitness_app',
  jwtSecret: process.env.JWT_SECRET || 'dev-jwt-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  resetTokenExpiresMinutes: toNumber(process.env.RESET_TOKEN_EXPIRES_MINUTES, 30),
  cardEncryptionSecret:
    process.env.CARD_ENCRYPTION_SECRET || 'dev-card-encryption-secret-change-me',
  enableGoogleFallbackMocks: process.env.ENABLE_GOOGLE_FALLBACK_MOCKS !== 'false',
};

module.exports = env;
