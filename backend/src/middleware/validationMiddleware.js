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

function normalizeStringArray(input, maxSize = 25) {
  const list = Array.isArray(input) ? input : [];
  return list
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, maxSize);
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
    assertNoUnknownFields(req.body, [
      'firstName',
      'lastName',
      'address',
      'promotionOptIn',
      'favorites',
      'favoriteRestaurants',
      'favoriteFoods',
      'dailyCalorieGoal',
      'proteinGoal',
      'carbsGoal',
      'fatsGoal',
      'fiberGoal',
      'preferredDiet',
      'macroPreference',
      'preferredCuisine',
      'fitnessGoal',
    ]);

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
      collectError(errors, Array.isArray(req.body.favorites), 'Favorites must be an array', 'favorites');
      validated.favorites = normalizeStringArray(req.body.favorites);
    }

    if ('favoriteRestaurants' in req.body) {
      collectError(
        errors,
        Array.isArray(req.body.favoriteRestaurants),
        'favoriteRestaurants must be an array',
        'favoriteRestaurants'
      );
      validated.favoriteRestaurants = normalizeStringArray(req.body.favoriteRestaurants);
    }

    if ('favoriteFoods' in req.body) {
      collectError(
        errors,
        Array.isArray(req.body.favoriteFoods),
        'favoriteFoods must be an array',
        'favoriteFoods'
      );
      validated.favoriteFoods = normalizeStringArray(req.body.favoriteFoods);
    }

    if (
      'dailyCalorieGoal' in req.body ||
      'proteinGoal' in req.body ||
      'carbsGoal' in req.body ||
      'fatsGoal' in req.body ||
      'fiberGoal' in req.body ||
      'preferredDiet' in req.body ||
      'macroPreference' in req.body ||
      'preferredCuisine' in req.body ||
      'fitnessGoal' in req.body
    ) {
      const dailyCalorieGoal = toNumber(req.body.dailyCalorieGoal);
      const proteinGoal = toNumber(req.body.proteinGoal);
      const carbsGoal = toNumber(req.body.carbsGoal);
      const fatsGoal = toNumber(req.body.fatsGoal);
      const fiberGoal = toNumber(req.body.fiberGoal);

      if ('dailyCalorieGoal' in req.body) {
        collectError(
          errors,
          Number.isFinite(dailyCalorieGoal) && dailyCalorieGoal >= 1200 && dailyCalorieGoal <= 5000,
          'dailyCalorieGoal must be between 1200 and 5000',
          'dailyCalorieGoal'
        );
        validated.dailyCalorieGoal = dailyCalorieGoal;
      }

      if ('proteinGoal' in req.body) {
        collectError(
          errors,
          Number.isFinite(proteinGoal) && proteinGoal >= 30 && proteinGoal <= 320,
          'proteinGoal must be between 30 and 320',
          'proteinGoal'
        );
        validated.proteinGoal = proteinGoal;
      }

      if ('carbsGoal' in req.body) {
        collectError(
          errors,
          Number.isFinite(carbsGoal) && carbsGoal >= 30 && carbsGoal <= 600,
          'carbsGoal must be between 30 and 600',
          'carbsGoal'
        );
        validated.carbsGoal = carbsGoal;
      }

      if ('fatsGoal' in req.body) {
        collectError(
          errors,
          Number.isFinite(fatsGoal) && fatsGoal >= 20 && fatsGoal <= 220,
          'fatsGoal must be between 20 and 220',
          'fatsGoal'
        );
        validated.fatsGoal = fatsGoal;
      }

      if ('fiberGoal' in req.body) {
        collectError(
          errors,
          Number.isFinite(fiberGoal) && fiberGoal >= 10 && fiberGoal <= 90,
          'fiberGoal must be between 10 and 90',
          'fiberGoal'
        );
        validated.fiberGoal = fiberGoal;
      }

      if ('preferredDiet' in req.body) {
        collectError(
          errors,
          ['veg', 'non-veg', 'vegan'].includes(String(req.body.preferredDiet || '').toLowerCase()),
          'preferredDiet is invalid',
          'preferredDiet'
        );
        validated.preferredDiet = req.body.preferredDiet;
      }

      if ('macroPreference' in req.body) {
        collectError(
          errors,
          ['balanced', 'protein', 'carb'].includes(
            String(req.body.macroPreference || '').toLowerCase()
          ),
          'macroPreference is invalid',
          'macroPreference'
        );
        validated.macroPreference = req.body.macroPreference;
      }

      if ('preferredCuisine' in req.body) {
        const preferredCuisine = String(req.body.preferredCuisine || '').trim();
        collectError(
          errors,
          preferredCuisine.length <= 60,
          'preferredCuisine must be 60 characters or fewer',
          'preferredCuisine'
        );
        validated.preferredCuisine = preferredCuisine;
      }

      if ('fitnessGoal' in req.body) {
        collectError(
          errors,
          ['lose-weight', 'maintain', 'gain-muscle'].includes(
            String(req.body.fitnessGoal || '').toLowerCase()
          ),
          'fitnessGoal is invalid',
          'fitnessGoal'
        );
        validated.fitnessGoal = req.body.fitnessGoal;
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

function validateUpdateCard(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['cardNumber', 'expiry', 'cardHolderName']);

    const errors = [];
    const validated = {};

    if ('cardNumber' in req.body) {
      const cardNumber = String(req.body.cardNumber || '').replace(/\s+/g, '');
      collectError(
        errors,
        /^\d{12,19}$/.test(cardNumber),
        'Card number must be 12-19 digits',
        'cardNumber'
      );
      validated.cardNumber = cardNumber;
    }

    if ('expiry' in req.body) {
      const expiry = String(req.body.expiry || '').trim();
      collectError(errors, validateExpiry(expiry), 'Expiry must be in MM/YY format', 'expiry');
      validated.expiry = expiry;
    }

    if ('cardHolderName' in req.body) {
      const cardHolderName = String(req.body.cardHolderName || '').trim();
      collectError(
        errors,
        cardHolderName.length >= 2 && cardHolderName.length <= 80,
        'Card holder name must be 2-80 characters',
        'cardHolderName'
      );
      validated.cardHolderName = cardHolderName;
    }

    collectError(errors, Object.keys(validated).length > 0, 'At least one card field must be provided', 'card');
    throwIfErrors(errors);

    req.validatedBody = validated;
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
      'preferredDiet',
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
    const preferredDiet = req.body.preferredDiet ? String(req.body.preferredDiet).toLowerCase() : null;

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

    if (preferredDiet !== null) {
      collectError(
        errors,
        ['veg', 'non-veg', 'vegan'].includes(preferredDiet),
        'preferredDiet is invalid',
        'preferredDiet'
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
      preferredDiet,
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

function validateCreateActivity(req, res, next) {
  try {
    assertNoUnknownFields(req.body, [
      'foodName',
      'restaurantName',
      'restaurantAddress',
      'caloriesConsumed',
      'caloriesBurned',
      'distanceMiles',
      'travelMode',
      'recommendationMessage',
      'nutrition',
    ]);

    const errors = [];

    const foodName = String(req.body.foodName || '').trim();
    const restaurantName = String(req.body.restaurantName || '').trim();
    const restaurantAddress = String(req.body.restaurantAddress || '').trim();
    const caloriesConsumed = toNumber(req.body.caloriesConsumed);
    const caloriesBurned = toNumber(req.body.caloriesBurned);
    const distanceMiles = toNumber(req.body.distanceMiles);
    const travelMode = String(req.body.travelMode || '').toLowerCase();
    const recommendationMessage = String(req.body.recommendationMessage || '').trim();

    const nutrition = {
      calories: toNumber(req.body.nutrition?.calories || caloriesConsumed) || 0,
      protein: toNumber(req.body.nutrition?.protein || 0) || 0,
      carbs: toNumber(req.body.nutrition?.carbs || 0) || 0,
      fats: toNumber(req.body.nutrition?.fats || 0) || 0,
    };

    collectError(errors, foodName.length > 0, 'foodName is required', 'foodName');
    collectError(errors, restaurantName.length > 0, 'restaurantName is required', 'restaurantName');
    collectError(
      errors,
      Number.isFinite(caloriesConsumed) && caloriesConsumed >= 0,
      'caloriesConsumed must be a non-negative number',
      'caloriesConsumed'
    );
    collectError(
      errors,
      Number.isFinite(caloriesBurned) && caloriesBurned >= 0,
      'caloriesBurned must be a non-negative number',
      'caloriesBurned'
    );
    collectError(
      errors,
      Number.isFinite(distanceMiles) && distanceMiles >= 0,
      'distanceMiles must be a non-negative number',
      'distanceMiles'
    );
    collectError(
      errors,
      ['walking', 'running', 'driving'].includes(travelMode),
      'travelMode must be walking, running, or driving',
      'travelMode'
    );

    throwIfErrors(errors);

    req.validatedBody = {
      foodName,
      restaurantName,
      restaurantAddress,
      caloriesConsumed,
      caloriesBurned,
      distanceMiles,
      travelMode,
      recommendationMessage,
      nutrition,
    };

    next();
  } catch (error) {
    next(error);
  }
}

function validateCreateMeal(req, res, next) {
  try {
    assertNoUnknownFields(req.body, [
      'foodName',
      'calories',
      'protein',
      'carbs',
      'fats',
      'fiber',
      'source',
      'timestamp',
    ]);

    const errors = [];

    const foodName = String(req.body.foodName || '').trim();
    const calories = toNumber(req.body.calories);
    const protein = toNumber(req.body.protein);
    const carbs = toNumber(req.body.carbs);
    const fats = toNumber(req.body.fats);
    const fiber = toNumber(req.body.fiber);
    const source = String(req.body.source || '').toLowerCase();
    const timestamp = req.body.timestamp ? new Date(req.body.timestamp) : new Date();

    collectError(errors, foodName.length >= 2 && foodName.length <= 120, 'foodName is invalid', 'foodName');
    collectError(errors, Number.isFinite(calories) && calories >= 0, 'calories must be non-negative', 'calories');
    collectError(errors, Number.isFinite(protein) && protein >= 0, 'protein must be non-negative', 'protein');
    collectError(errors, Number.isFinite(carbs) && carbs >= 0, 'carbs must be non-negative', 'carbs');
    collectError(errors, Number.isFinite(fats) && fats >= 0, 'fats must be non-negative', 'fats');
    collectError(errors, Number.isFinite(fiber) && fiber >= 0, 'fiber must be non-negative', 'fiber');
    collectError(errors, ['restaurant', 'grocery', 'custom'].includes(source), 'source is invalid', 'source');
    collectError(
      errors,
      timestamp instanceof Date && !Number.isNaN(timestamp.getTime()),
      'timestamp is invalid',
      'timestamp'
    );

    throwIfErrors(errors);

    req.validatedBody = {
      foodName,
      calories,
      protein,
      carbs,
      fats,
      fiber,
      source,
      timestamp: timestamp.toISOString(),
    };

    next();
  } catch (error) {
    next(error);
  }
}

function validateNutritionRemainingQuery(req, res, next) {
  try {
    const lat =
      req.query.lat === undefined || req.query.lat === null || req.query.lat === ''
        ? null
        : toNumber(req.query.lat);
    const lng =
      req.query.lng === undefined || req.query.lng === null || req.query.lng === ''
        ? null
        : toNumber(req.query.lng);
    const radius =
      req.query.radius === undefined || req.query.radius === null || req.query.radius === ''
        ? 5
        : toNumber(req.query.radius);

    const errors = [];

    if (lat !== null || lng !== null) {
      collectError(errors, isValidLatitude(lat), 'lat must be valid when provided', 'lat');
      collectError(errors, isValidLongitude(lng), 'lng must be valid when provided', 'lng');
    }

    collectError(errors, Number.isFinite(radius), 'radius must be a valid number', 'radius');
    if (Number.isFinite(radius)) {
      collectError(errors, radius > 0, 'radius must be greater than 0', 'radius');
      collectError(errors, radius <= 20, 'radius cannot exceed 20 miles', 'radius');
    }

    throwIfErrors(errors);

    req.validatedQuery = {
      lat,
      lng,
      radius,
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
  validateUpdateCard,
  validateSearch,
  validateRouteRequest,
  validateCreateActivity,
  validateCreateMeal,
  validateNutritionRemainingQuery,
};
