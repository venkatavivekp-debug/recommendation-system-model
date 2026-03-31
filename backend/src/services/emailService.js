const logger = require('../utils/logger');

function sendVerificationEmail(email, verificationToken) {
  logger.info('Mock verification email sent', {
    email,
    verificationToken,
  });
}

function sendPasswordResetEmail(email, resetToken) {
  logger.info('Mock password reset email sent', {
    email,
    resetToken,
  });
}

function sendProfileUpdatedEmail(email, changedFields) {
  logger.info('Mock profile update email sent', {
    email,
    changedFields,
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendProfileUpdatedEmail,
};
