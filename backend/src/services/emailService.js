const logger = require('../utils/logger');

let nodemailer = null;
try {
  // Optional dependency: if missing, BFIT falls back to logged mock delivery.
  // eslint-disable-next-line global-require, import/no-extraneous-dependencies
  nodemailer = require('nodemailer');
} catch (_error) {
  nodemailer = null;
}

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

function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function createTransporter() {
  if (!nodemailer || !hasSmtpConfig()) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function formatShareEmailBody({ type, message, data }) {
  const lines = [];
  lines.push(`BFIT shared update (${type})`);
  lines.push('');

  if (message) {
    lines.push(`Message: ${message}`);
    lines.push('');
  }

  if (type === 'diet') {
    lines.push(`Date: ${data?.date || 'today'}`);
    lines.push(`Calories consumed: ${data?.summary?.caloriesConsumed ?? 0} kcal`);
    lines.push(`Calories burned: ${data?.summary?.caloriesBurned ?? 0} kcal`);
    lines.push(`Net calories: ${data?.summary?.netCalories ?? 0} kcal`);
    lines.push(
      `Macros: P ${data?.summary?.protein ?? 0}g | C ${data?.summary?.carbs ?? 0}g | F ${data?.summary?.fats ?? 0}g | Fiber ${data?.summary?.fiber ?? 0}g`
    );
    lines.push(`Meals logged: ${Array.isArray(data?.meals) ? data.meals.length : 0}`);
    lines.push(`Exercises logged: ${Array.isArray(data?.exercises) ? data.exercises.length : 0}`);
  } else if (type === 'recipe') {
    lines.push(`Recipe: ${data?.title || data?.name || 'Recipe'}`);
    lines.push(`Calories: ${data?.macros?.calories ?? data?.calories ?? 0} kcal`);
    lines.push(
      `Macros: P ${data?.macros?.protein ?? data?.protein ?? 0}g | C ${data?.macros?.carbs ?? data?.carbs ?? 0}g | F ${data?.macros?.fats ?? data?.fats ?? 0}g | Fiber ${data?.macros?.fiber ?? data?.fiber ?? 0}g`
    );
    lines.push(`Ingredients: ${(data?.ingredients || []).map((item) => (typeof item === 'string' ? item : item.name)).join(', ')}`);
  } else {
    lines.push('Plan details:');
    lines.push(JSON.stringify(data || {}, null, 2));
  }

  lines.push('');
  lines.push('Sent from BFIT (Be Fit).');
  return lines.join('\n');
}

async function sendShareEmail({ toEmail, subject, message, type, data }) {
  const safeToEmail = String(toEmail || '').trim();
  const safeSubject = String(subject || '').trim() || 'BFIT shared update';
  const safeType = String(type || 'diet').trim().toLowerCase();
  const safeMessage = String(message || '').trim();
  const text = formatShareEmailBody({
    type: safeType,
    message: safeMessage,
    data,
  });

  const transporter = createTransporter();
  if (!transporter) {
    logger.info('Mock share email sent (SMTP not configured)', {
      toEmail: safeToEmail,
      subject: safeSubject,
      type: safeType,
    });

    return {
      delivered: true,
      provider: 'mock',
      messageId: `mock-${Date.now()}`,
    };
  }

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: safeToEmail,
    subject: safeSubject,
    text,
  });

  return {
    delivered: true,
    provider: 'smtp',
    messageId: info.messageId,
  };
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendProfileUpdatedEmail,
  sendShareEmail,
};
