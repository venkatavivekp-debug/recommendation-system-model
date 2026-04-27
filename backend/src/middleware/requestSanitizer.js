const SENSITIVE_KEYS = new Set([
  'password',
  'newpassword',
  'currentpassword',
  'token',
  'verificationtoken',
  'resettoken',
  'authorization',
  'imagebase64',
  'cardnumber',
  'cvv',
]);

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function sanitizeString(value) {
  return String(value)
    .replace(/\0/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/<\s*\/?\s*script\b[^>]*>/gi, '')
    .replace(/javascript\s*:/gi, '')
    .trim();
}

function sanitizeValue(value, key = '') {
  const normalizedKey = String(key || '').toLowerCase();
  if (SENSITIVE_KEYS.has(normalizedKey)) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, key));
  }

  if (isPlainObject(value)) {
    return sanitizeObject(value);
  }

  return value;
}

function sanitizeObject(source = {}) {
  const clean = {};
  Object.entries(source).forEach(([key, value]) => {
    clean[key] = sanitizeValue(value, key);
  });
  return clean;
}

function assignSanitized(target) {
  if (!isPlainObject(target)) {
    return;
  }

  const clean = sanitizeObject(target);
  Object.keys(target).forEach((key) => {
    delete target[key];
  });
  Object.entries(clean).forEach(([key, value]) => {
    target[key] = value;
  });
}

function requestSanitizer(req, _res, next) {
  try {
    assignSanitized(req.body);
    assignSanitized(req.query);
  } catch (_error) {
    // Sanitization is defensive; route validation remains the source of truth.
  }

  next();
}

module.exports = requestSanitizer;
