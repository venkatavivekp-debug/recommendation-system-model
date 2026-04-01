const AppError = require('../utils/appError');
const { verifyJwt } = require('../utils/token');
const userService = require('../services/userService');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return next(new AppError('Authentication token is missing', 401, 'UNAUTHORIZED'));
  }

  try {
    const payload = verifyJwt(token);
    const user = await userService.getUserById(payload.sub);

    if (!user) {
      return next(new AppError('User account no longer exists', 401, 'UNAUTHORIZED'));
    }

    req.auth = {
      userId: user.id,
      role: String(user.role || 'user').toLowerCase(),
      email: user.email,
    };

    return next();
  } catch (error) {
    return next(new AppError('Invalid or expired token', 401, 'UNAUTHORIZED'));
  }
}

function checkRole(roles) {
  return (req, res, next) => {
    const roleList = (Array.isArray(roles) ? roles : [roles]).map((role) =>
      String(role || '').toLowerCase()
    );
    const role = String(req.auth?.role || '').toLowerCase();

    if (!req.auth || !roleList.includes(role)) {
      return next(new AppError('Forbidden: insufficient privileges', 403, 'FORBIDDEN'));
    }

    return next();
  };
}

const requireRole = checkRole;

module.exports = {
  requireAuth,
  requireRole,
  checkRole,
};
