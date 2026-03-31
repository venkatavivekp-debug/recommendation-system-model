const AppError = require('../utils/appError');

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').toLowerCase());
}

function isValidLatitude(value) {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value) {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function validateExpiry(value) {
  return /^(0[1-9]|1[0-2])\/(\d{2})$/.test(String(value || '').trim());
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assertNoUnknownFields(body, allowedFields) {
  const payload = body && typeof body === 'object' ? body : {};
  const unknown = Object.keys(payload).filter((field) => !allowedFields.includes(field));

  if (unknown.length) {
    throw new AppError('Request contains unsupported fields', 400, 'VALIDATION_ERROR', {
      unknownFields: unknown,
    });
  }
}

function collectError(errors, condition, message, field) {
  if (!condition) {
    errors.push({ field, message });
  }
}

function throwIfErrors(errors) {
  if (errors.length) {
    throw new AppError('Validation failed', 400, 'VALIDATION_ERROR', errors);
  }
}

function validateRegister(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['firstName', 'lastName', 'email', 'password', 'promotionOptIn']);

    const errors = [];
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const promotionOptIn = Boolean(req.body.promotionOptIn);

    collectError(
      errors,
      firstName.length >= 2 && firstName.length <= 50,
      'First name must be 2-50 characters',
      'firstName'
    );
    collectError(
      errors,
      lastName.length >= 2 && lastName.length <= 50,
      'Last name must be 2-50 characters',
      'lastName'
    );
    collectError(errors, isEmail(email), 'Email is invalid', 'email');
    collectError(errors, password.length >= 8, 'Password must be at least 8 characters', 'password');

    throwIfErrors(errors);

    req.validatedBody = {
      firstName,
      lastName,
      email,
      password,
      promotionOptIn,
    };

    next();
  } catch (error) {
    next(error);
  }
}

function validateVerifyEmail(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['email', 'token']);

    const errors = [];
    const email = String(req.body.email || '').trim().toLowerCase();
    const token = String(req.body.token || '').trim();

    collectError(errors, isEmail(email), 'Email is invalid', 'email');
    collectError(errors, token.length >= 32, 'Verification token is invalid', 'token');
    throwIfErrors(errors);

    req.validatedBody = { email, token };
    next();
  } catch (error) {
    next(error);
  }
}

function validateLogin(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['email', 'password']);

    const errors = [];
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');

    collectError(errors, isEmail(email), 'Email is invalid', 'email');
    collectError(errors, password.length > 0, 'Password is required', 'password');
    throwIfErrors(errors);

    req.validatedBody = { email, password };
    next();
  } catch (error) {
    next(error);
  }
}

function validateForgotPassword(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['email']);

    const email = String(req.body.email || '').trim().toLowerCase();
    if (!isEmail(email)) {
      throw new AppError('Email is invalid', 400, 'VALIDATION_ERROR', [
        { field: 'email', message: 'Email is invalid' },
      ]);
    }

    req.validatedBody = { email };
    next();
  } catch (error) {
    next(error);
  }
}

function validateResetPassword(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['token', 'newPassword']);

    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.newPassword || '');

    const errors = [];
    collectError(errors, token.length >= 32, 'Reset token is invalid', 'token');
    collectError(
      errors,
      newPassword.length >= 8,
      'New password must be at least 8 characters',
      'newPassword'
    );
    throwIfErrors(errors);

    req.validatedBody = { token, newPassword };
    next();
  } catch (error) {
    next(error);
  }
}

function validateChangePassword(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['currentPassword', 'newPassword']);

    const currentPassword = String(req.body.currentPassword || '');
    const newPassword = String(req.body.newPassword || '');

    const errors = [];
    collectError(errors, currentPassword.length > 0, 'Current password is required', 'currentPassword');
    collectError(
      errors,
      newPassword.length >= 8,
      'New password must be at least 8 characters',
      'newPassword'
    );
    throwIfErrors(errors);

    req.validatedBody = { currentPassword, newPassword };
    next();
  } catch (error) {
    next(error);
  }
}

function validateProfileUpdate(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['firstName', 'lastName', 'address', 'promotionOptIn', 'favorites']);

    const errors = [];
    const validated = {};

    if ('firstName' in req.body) {
      const firstName = String(req.body.firstName || '').trim();
      collectError(
        errors,
        firstName.length >= 2 && firstName.length <= 50,
        'First name must be 2-50 characters',
        'firstName'
      );
      validated.firstName = firstName;
    }

    if ('lastName' in req.body) {
      const lastName = String(req.body.lastName || '').trim();
      collectError(
        errors,
        lastName.length >= 2 && lastName.length <= 50,
        'Last name must be 2-50 characters',
        'lastName'
      );
      validated.lastName = lastName;
    }

    if ('address' in req.body) {
      const address = String(req.body.address || '').trim();
      collectError(
        errors,
        address.length >= 5 && address.length <= 180,
        'Address must be 5-180 characters',
        'address'
      );
      validated.address = address;
    }

    if ('promotionOptIn' in req.body) {
      validated.promotionOptIn = Boolean(req.body.promotionOptIn);
    }

    if ('favorites' in req.body) {
      const favorites = Array.isArray(req.body.favorites) ? req.body.favorites : null;
      collectError(errors, Array.isArray(favorites), 'Favorites must be an array', 'favorites');

      if (favorites) {
        const normalizedFavorites = favorites
          .map((item) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 25);
        validated.favorites = normalizedFavorites;
      }
    }

    throwIfErrors(errors);

    req.validatedBody = validated;
    next();
  } catch (error) {
    next(error);
  }
}

function validateAddCard(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['cardNumber', 'expiry', 'cardHolderName']);

    const errors = [];
    const cardNumber = String(req.body.cardNumber || '').replace(/\s+/g, '');
    const expiry = String(req.body.expiry || '').trim();
    const cardHolderName = String(req.body.cardHolderName || '').trim();

    collectError(
      errors,
      /^\d{12,19}$/.test(cardNumber),
      'Card number must be 12-19 digits',
      'cardNumber'
    );
    collectError(errors, validateExpiry(expiry), 'Expiry must be in MM/YY format', 'expiry');
    collectError(
      errors,
      cardHolderName.length >= 2 && cardHolderName.length <= 80,
      'Card holder name must be 2-80 characters',
      'cardHolderName'
    );

    throwIfErrors(errors);

    req.validatedBody = {
      cardNumber,
      expiry,
      cardHolderName,
    };

    next();
  } catch (error) {
    next(error);
  }
}

function validateSearch(req, res, next) {
  try {
    assertNoUnknownFields(req.body, [
      'keyword',
      'lat',
      'lng',
      'radius',
      'minCalories',
      'maxCalories',
      'macroFocus',
    ]);

    const errors = [];
    const keyword = String(req.body.keyword || '').trim();
    const lat = toNumber(req.body.lat);
    const lng = toNumber(req.body.lng);
    const radius =
      req.body.radius === undefined || req.body.radius === null || req.body.radius === ''
        ? 5
        : toNumber(req.body.radius);
    const minCalories =
      req.body.minCalories === undefined || req.body.minCalories === null || req.body.minCalories === ''
        ? null
        : toNumber(req.body.minCalories);
    const maxCalories =
      req.body.maxCalories === undefined || req.body.maxCalories === null || req.body.maxCalories === ''
        ? null
        : toNumber(req.body.maxCalories);
    const macroFocus = req.body.macroFocus ? String(req.body.macroFocus).toLowerCase() : null;

    collectError(errors, keyword.length > 0, 'Keyword is required', 'keyword');
    collectError(
      errors,
      isValidLatitude(lat),
      'Latitude must be a valid number between -90 and 90',
      'lat'
    );
    collectError(
      errors,
      isValidLongitude(lng),
      'Longitude must be a valid number between -180 and 180',
      'lng'
    );
    collectError(errors, Number.isFinite(radius), 'Radius must be a valid number', 'radius');

    if (Number.isFinite(radius)) {
      collectError(errors, radius > 0, 'Radius must be greater than 0', 'radius');
      collectError(errors, radius <= 20, 'Radius cannot exceed 20 miles', 'radius');
    }

    if (minCalories !== null) {
      collectError(
        errors,
        Number.isFinite(minCalories) && minCalories >= 0,
        'minCalories must be a non-negative number',
        'minCalories'
      );
    }

    if (maxCalories !== null) {
      collectError(
        errors,
        Number.isFinite(maxCalories) && maxCalories >= 0,
        'maxCalories must be a non-negative number',
        'maxCalories'
      );
    }

    if (minCalories !== null && maxCalories !== null) {
      collectError(
        errors,
        minCalories <= maxCalories,
        'minCalories must be less than or equal to maxCalories',
        'minCalories'
      );
    }

    if (macroFocus !== null) {
      collectError(
        errors,
        ['protein', 'carb'].includes(macroFocus),
        'macroFocus must be either protein or carb',
        'macroFocus'
      );
    }

    throwIfErrors(errors);

    req.validatedBody = {
      keyword,
      lat,
      lng,
      radius,
      minCalories,
      maxCalories,
      macroFocus,
    };

    next();
  } catch (error) {
    next(error);
  }
}

function validateRouteRequest(req, res, next) {
  try {
    assertNoUnknownFields(req.body, [
      'originLat',
      'originLng',
      'destinationLat',
      'destinationLng',
      'mode',
      'consumedCalories',
    ]);

    const errors = [];
    const originLat = toNumber(req.body.originLat);
    const originLng = toNumber(req.body.originLng);
    const destinationLat = toNumber(req.body.destinationLat);
    const destinationLng = toNumber(req.body.destinationLng);
    const mode = String(req.body.mode || '').toLowerCase();
    const consumedCalories =
      req.body.consumedCalories === undefined ||
      req.body.consumedCalories === null ||
      req.body.consumedCalories === ''
        ? null
        : toNumber(req.body.consumedCalories);

    collectError(errors, isValidLatitude(originLat), 'originLat must be a valid latitude', 'originLat');
    collectError(errors, isValidLongitude(originLng), 'originLng must be a valid longitude', 'originLng');
    collectError(
      errors,
      isValidLatitude(destinationLat),
      'destinationLat must be a valid latitude',
      'destinationLat'
    );
    collectError(
      errors,
      isValidLongitude(destinationLng),
      'destinationLng must be a valid longitude',
      'destinationLng'
    );
    collectError(
      errors,
      ['walking', 'running', 'driving'].includes(mode),
      'mode must be walking, running, or driving',
      'mode'
    );

    if (consumedCalories !== null) {
      collectError(
        errors,
        Number.isFinite(consumedCalories) && consumedCalories >= 0,
        'consumedCalories must be a non-negative number',
        'consumedCalories'
      );
    }

    throwIfErrors(errors);

    req.validatedBody = {
      originLat,
      originLng,
      destinationLat,
      destinationLng,
      mode,
      consumedCalories,
    };

    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  validateRegister,
  validateVerifyEmail,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  validateProfileUpdate,
  validateAddCard,
  validateSearch,
  validateRouteRequest,
};
