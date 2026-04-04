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

function normalizeIsoDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

function validateRegister(req, res, next) {
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  const firstName = String(payload.firstName || '').trim();
  const lastName = String(payload.lastName || '').trim();
  const email = String(payload.email || '').trim().toLowerCase();
  const password = String(payload.password || '');

  if (!firstName || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  req.validatedBody = {
    firstName,
    lastName,
    email,
    password,
  };

  return next();
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
      'brand',
      'calories',
      'protein',
      'carbs',
      'fats',
      'fiber',
      'portion',
      'source',
      'sourceType',
      'mealType',
      'ingredients',
      'allergyWarnings',
      'timestamp',
    ]);

    const errors = [];

    const foodName = String(req.body.foodName || '').trim();
    const brand = String(req.body.brand || '').trim();
    const calories = toNumber(req.body.calories);
    const protein = toNumber(req.body.protein);
    const carbs = toNumber(req.body.carbs);
    const fats = toNumber(req.body.fats);
    const fiber = toNumber(req.body.fiber);
    const portion = req.body.portion === undefined ? 1 : toNumber(req.body.portion);
    const source = String(req.body.sourceType || req.body.source || '').toLowerCase();
    const mealType = String(req.body.mealType || '').toLowerCase();
    const ingredients = normalizeStringArray(req.body.ingredients || [], 60);
    const allergyWarnings = normalizeStringArray(req.body.allergyWarnings || [], 20);
    const timestamp = req.body.timestamp ? new Date(req.body.timestamp) : new Date();

    collectError(errors, foodName.length >= 2 && foodName.length <= 120, 'foodName is invalid', 'foodName');
    collectError(errors, Number.isFinite(calories) && calories >= 0, 'calories must be non-negative', 'calories');
    collectError(errors, Number.isFinite(protein) && protein >= 0, 'protein must be non-negative', 'protein');
    collectError(errors, Number.isFinite(carbs) && carbs >= 0, 'carbs must be non-negative', 'carbs');
    collectError(errors, Number.isFinite(fats) && fats >= 0, 'fats must be non-negative', 'fats');
    collectError(errors, Number.isFinite(fiber) && fiber >= 0, 'fiber must be non-negative', 'fiber');
    collectError(
      errors,
      Number.isFinite(portion) && portion >= 0.1 && portion <= 10,
      'portion must be between 0.1 and 10',
      'portion'
    );
    collectError(
      errors,
      ['restaurant', 'grocery', 'custom', 'recipe'].includes(source),
      'sourceType is invalid',
      'sourceType'
    );
    if ('mealType' in req.body) {
      collectError(
        errors,
        ['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType),
        'mealType is invalid',
        'mealType'
      );
    }
    collectError(
      errors,
      timestamp instanceof Date && !Number.isNaN(timestamp.getTime()),
      'timestamp is invalid',
      'timestamp'
    );

    throwIfErrors(errors);

    req.validatedBody = {
      foodName,
      brand: brand || null,
      calories,
      protein,
      carbs,
      fats,
      fiber,
      portion,
      mealType: mealType || null,
      ingredients,
      allergyWarnings,
      source,
      sourceType: source,
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

function validateFoodLookup(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['query', 'foodName', 'brand', 'servingSize']);

    const query = String(req.body.query || req.body.foodName || '').trim();
    const brand = String(req.body.brand || '').trim();
    const servingSize = String(req.body.servingSize || '').trim();

    const errors = [];
    collectError(errors, query.length >= 2, 'query is required', 'query');
    if (servingSize) {
      collectError(errors, servingSize.length <= 60, 'servingSize must be 60 chars or fewer', 'servingSize');
    }

    throwIfErrors(errors);

    req.validatedBody = {
      query,
      brand: brand || null,
      servingSize: servingSize || null,
    };

    next();
  } catch (error) {
    next(error);
  }
}

function validateMealBuilderRequest(req, res, next) {
  try {
    assertNoUnknownFields(req.body, [
      'remaining',
      'allergies',
      'preferences',
      'mode',
      'ingredientFocus',
      'maxSuggestions',
    ]);

    const errors = [];
    const remaining = req.body.remaining && typeof req.body.remaining === 'object' ? req.body.remaining : {};
    const mode = String(req.body.mode || 'meal-builder').toLowerCase();
    const ingredientFocus = normalizeStringArray(req.body.ingredientFocus || [], 20);
    const maxSuggestions = req.body.maxSuggestions === undefined ? 4 : toNumber(req.body.maxSuggestions);

    const normalizedRemaining = {
      calories: toNumber(remaining.calories ?? remaining.remainingCalories),
      protein: toNumber(remaining.protein ?? remaining.remainingProtein),
      carbs: toNumber(remaining.carbs ?? remaining.remainingCarbs),
      fats: toNumber(remaining.fats ?? remaining.remainingFats),
      fiber: toNumber(remaining.fiber ?? remaining.remainingFiber),
    };

    collectError(
      errors,
      ['meal-builder', 'recipe'].includes(mode),
      'mode must be meal-builder or recipe',
      'mode'
    );
    collectError(
      errors,
      Number.isFinite(maxSuggestions) && maxSuggestions >= 1 && maxSuggestions <= 12,
      'maxSuggestions must be between 1 and 12',
      'maxSuggestions'
    );

    Object.entries(normalizedRemaining).forEach(([key, value]) => {
      if (value !== null) {
        collectError(errors, Number.isFinite(value) && value >= -1000, `${key} is invalid`, key);
      }
    });

    throwIfErrors(errors);

    req.validatedBody = {
      remaining: normalizedRemaining,
      allergies: normalizeStringArray(req.body.allergies || [], 30),
      preferences: req.body.preferences && typeof req.body.preferences === 'object' ? req.body.preferences : {},
      mode,
      ingredientFocus,
      maxSuggestions: maxSuggestions === null ? 4 : maxSuggestions,
    };

    next();
  } catch (error) {
    next(error);
  }
}

function validateCreateRecipe(req, res, next) {
  try {
    assertNoUnknownFields(req.body, [
      'title',
      'ingredients',
      'steps',
      'macros',
      'prepTimeMinutes',
      'allergyNotes',
      'whyFitsPlan',
      'youtubeLink',
      'imageUrl',
      'visibility',
    ]);

    const errors = [];
    const title = String(req.body.title || '').trim();
    const ingredients = Array.isArray(req.body.ingredients) ? req.body.ingredients : [];
    const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
    const macros = req.body.macros && typeof req.body.macros === 'object' ? req.body.macros : {};
    const prepTimeMinutes = req.body.prepTimeMinutes === undefined ? 20 : toNumber(req.body.prepTimeMinutes);

    const normalizedIngredients = ingredients
      .map((item) => {
        if (item && typeof item === 'object') {
          return {
            name: String(item.name || '').trim(),
            amount: String(item.amount || '').trim(),
          };
        }

        if (typeof item === 'string') {
          return {
            name: item.trim(),
            amount: 'to taste',
          };
        }

        return null;
      })
      .filter(Boolean)
      .filter((item) => item.name.length > 0)
      .slice(0, 40);

    const normalizedSteps = steps
      .map((item) => String(item || '').trim())
      .filter(Boolean)
      .slice(0, 40);

    collectError(errors, title.length >= 4 && title.length <= 140, 'title must be 4-140 chars', 'title');
    collectError(errors, normalizedIngredients.length >= 2, 'at least 2 ingredients required', 'ingredients');
    collectError(errors, normalizedSteps.length >= 2, 'at least 2 steps required', 'steps');
    collectError(
      errors,
      Number.isFinite(prepTimeMinutes) && prepTimeMinutes >= 5 && prepTimeMinutes <= 240,
      'prepTimeMinutes must be between 5 and 240',
      'prepTimeMinutes'
    );

    const normalizedMacros = {
      calories: toNumber(macros.calories) || 0,
      protein: toNumber(macros.protein) || 0,
      carbs: toNumber(macros.carbs) || 0,
      fats: toNumber(macros.fats) || 0,
      fiber: toNumber(macros.fiber) || 0,
    };

    Object.entries(normalizedMacros).forEach(([key, value]) => {
      collectError(errors, Number.isFinite(value) && value >= 0, `${key} must be non-negative`, key);
    });

    throwIfErrors(errors);

    req.validatedBody = {
      title,
      ingredients: normalizedIngredients,
      steps: normalizedSteps,
      macros: normalizedMacros,
      prepTimeMinutes,
      allergyNotes: normalizeStringArray(req.body.allergyNotes || [], 30),
      whyFitsPlan: String(req.body.whyFitsPlan || '').trim(),
      youtubeLink: String(req.body.youtubeLink || '').trim(),
      imageUrl: String(req.body.imageUrl || '').trim(),
      visibility: String(req.body.visibility || 'public').trim().toLowerCase(),
    };

    collectError(
      errors,
      ['private', 'public'].includes(req.validatedBody.visibility),
      'visibility must be private or public',
      'visibility'
    );
    throwIfErrors(errors);

    next();
  } catch (error) {
    next(error);
  }
}

function validateCreateRecipeReview(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['rating', 'comment']);

    const rating = toNumber(req.body.rating);
    const comment = String(req.body.comment || '').trim();
    const errors = [];

    collectError(errors, Number.isFinite(rating) && rating >= 1 && rating <= 5, 'rating must be 1-5', 'rating');
    if (comment) {
      collectError(errors, comment.length <= 500, 'comment must be 500 chars or fewer', 'comment');
    }

    throwIfErrors(errors);

    req.validatedBody = {
      rating,
      comment,
    };

    next();
  } catch (error) {
    next(error);
  }
}

function validateCalendarPlan(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['date', 'plannedCalories', 'isCheatDay', 'note']);

    const date = normalizeIsoDate(req.body.date);
    const plannedCalories = toNumber(req.body.plannedCalories);
    const isCheatDay = req.body.isCheatDay === undefined ? undefined : Boolean(req.body.isCheatDay);
    const note = String(req.body.note || '').trim();
    const errors = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    collectError(errors, Boolean(date), 'date must be a valid date', 'date');
    collectError(
      errors,
      Number.isFinite(plannedCalories) && plannedCalories >= 800 && plannedCalories <= 8000,
      'plannedCalories must be between 800 and 8000',
      'plannedCalories'
    );
    if (req.body.note !== undefined) {
      collectError(errors, note.length <= 180, 'note must be 180 characters or fewer', 'note');
    }

    if (date) {
      const day = new Date(`${date}T00:00:00.000Z`);
      const max = new Date(today);
      max.setDate(max.getDate() + 31);

      collectError(errors, day >= today, 'date cannot be in the past', 'date');
      collectError(errors, day <= max, 'date can be up to 31 days ahead', 'date');
    }

    throwIfErrors(errors);

    req.validatedBody = {
      date,
      plannedCalories,
      ...(isCheatDay !== undefined ? { isCheatDay } : {}),
      note,
    };

    next();
  } catch (error) {
    next(error);
  }
}

function validateCalendarDayParam(req, res, next) {
  try {
    const date = normalizeIsoDate(req.params.date);
    if (!date) {
      throw new AppError('date must be YYYY-MM-DD', 400, 'VALIDATION_ERROR', [
        { field: 'date', message: 'date must be YYYY-MM-DD' },
      ]);
    }

    req.validatedParams = { date };
    next();
  } catch (error) {
    next(error);
  }
}

function normalizeExerciseEntries(entries, errors, parentField = 'exercises') {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length > 40) {
    errors.push({ field: parentField, message: 'Too many exercises. Maximum is 40.' });
  }

  return list.slice(0, 40).map((entry, index) => {
    if (!entry || typeof entry !== 'object') {
      errors.push({ field: `${parentField}[${index}]`, message: 'Exercise must be an object' });
      return null;
    }

    const normalized = {
      name: String(entry.name || '').trim(),
      sets: toNumber(entry.sets) ?? 0,
      reps: toNumber(entry.reps) ?? 0,
      weightKg: toNumber(entry.weightKg ?? entry.weight) ?? 0,
      durationMinutes: toNumber(entry.durationMinutes) ?? 0,
      intensity: String(entry.intensity || 'moderate').toLowerCase(),
    };

    if (!normalized.name) {
      errors.push({ field: `${parentField}[${index}].name`, message: 'Exercise name is required' });
    }
    if (normalized.sets < 0 || normalized.sets > 200) {
      errors.push({ field: `${parentField}[${index}].sets`, message: 'sets must be between 0 and 200' });
    }
    if (normalized.reps < 0 || normalized.reps > 500) {
      errors.push({ field: `${parentField}[${index}].reps`, message: 'reps must be between 0 and 500' });
    }
    if (normalized.weightKg < 0 || normalized.weightKg > 600) {
      errors.push({
        field: `${parentField}[${index}].weightKg`,
        message: 'weightKg must be between 0 and 600',
      });
    }
    if (normalized.durationMinutes < 0 || normalized.durationMinutes > 600) {
      errors.push({
        field: `${parentField}[${index}].durationMinutes`,
        message: 'durationMinutes must be between 0 and 600',
      });
    }
    if (!['light', 'moderate', 'intense', 'high'].includes(normalized.intensity)) {
      errors.push({
        field: `${parentField}[${index}].intensity`,
        message: 'intensity must be light, moderate, intense, or high',
      });
    }

    return normalized;
  }).filter(Boolean);
}

function normalizeTimestampOrNow(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

function validateExerciseLog(req, res, next) {
  try {
    assertNoUnknownFields(req.body, [
      'workoutType',
      'exercises',
      'exerciseName',
      'sets',
      'reps',
      'weightKg',
      'durationMinutes',
      'bodyWeightKg',
      'intensity',
      'steps',
      'distanceMiles',
      'notes',
      'timestamp',
      'source',
      'provider',
    ]);

    const errors = [];
    const workoutType = String(req.body.workoutType || '').trim().toLowerCase();
    const durationMinutes = toNumber(req.body.durationMinutes) ?? 0;
    const bodyWeightKg = toNumber(req.body.bodyWeightKg) ?? 70;
    const steps = toNumber(req.body.steps) ?? 0;
    const distanceMiles = toNumber(req.body.distanceMiles) ?? 0;
    const intensity = String(req.body.intensity || 'moderate').toLowerCase();
    const notes = String(req.body.notes || '').trim();
    const source = String(req.body.source || 'manual').toLowerCase();
    const provider = String(req.body.provider || 'manual').toLowerCase();
    const timestamp = normalizeTimestampOrNow(req.body.timestamp);

    const exercises = normalizeExerciseEntries(
      req.body.exercises && req.body.exercises.length
        ? req.body.exercises
        : [
            {
              name: req.body.exerciseName,
              sets: req.body.sets,
              reps: req.body.reps,
              weightKg: req.body.weightKg,
              durationMinutes: req.body.durationMinutes,
              intensity,
            },
          ],
      errors
    );

    collectError(errors, workoutType.length >= 2, 'workoutType is required', 'workoutType');
    collectError(
      errors,
      Number.isFinite(durationMinutes) && durationMinutes >= 0 && durationMinutes <= 600,
      'durationMinutes must be between 0 and 600',
      'durationMinutes'
    );
    collectError(
      errors,
      Number.isFinite(bodyWeightKg) && bodyWeightKg >= 20 && bodyWeightKg <= 350,
      'bodyWeightKg must be between 20 and 350',
      'bodyWeightKg'
    );
    collectError(errors, Number.isFinite(steps) && steps >= 0 && steps <= 150000, 'steps is invalid', 'steps');
    collectError(
      errors,
      Number.isFinite(distanceMiles) && distanceMiles >= 0 && distanceMiles <= 200,
      'distanceMiles is invalid',
      'distanceMiles'
    );
    collectError(
      errors,
      ['light', 'moderate', 'intense', 'high'].includes(intensity),
      'intensity is invalid',
      'intensity'
    );
    collectError(
      errors,
      ['manual', 'wearable-sync', 'estimated'].includes(source),
      'source is invalid',
      'source'
    );
    collectError(errors, provider.length > 0 && provider.length <= 40, 'provider is invalid', 'provider');
    collectError(errors, Boolean(timestamp), 'timestamp is invalid', 'timestamp');
    collectError(
      errors,
      exercises.length > 0 || steps > 0 || distanceMiles > 0,
      'Provide at least one exercise or steps/distance',
      'exercises'
    );

    throwIfErrors(errors);

    req.validatedBody = {
      workoutType,
      exercises,
      durationMinutes,
      bodyWeightKg,
      steps,
      distanceMiles,
      intensity,
      notes,
      source,
      provider,
      timestamp,
    };
    next();
  } catch (error) {
    next(error);
  }
}

function validateStepLog(req, res, next) {
  try {
    assertNoUnknownFields(req.body, [
      'steps',
      'distanceMiles',
      'durationMinutes',
      'bodyWeightKg',
      'intensity',
      'notes',
      'timestamp',
    ]);

    const errors = [];
    const steps = toNumber(req.body.steps) ?? 0;
    const distanceMiles = toNumber(req.body.distanceMiles) ?? 0;
    const durationMinutes = toNumber(req.body.durationMinutes) ?? 0;
    const bodyWeightKg = toNumber(req.body.bodyWeightKg) ?? 70;
    const intensity = String(req.body.intensity || 'moderate').toLowerCase();
    const notes = String(req.body.notes || '').trim();
    const timestamp = normalizeTimestampOrNow(req.body.timestamp);

    collectError(
      errors,
      steps > 0 || distanceMiles > 0 || durationMinutes > 0,
      'Provide steps, distanceMiles, or durationMinutes',
      'steps'
    );
    collectError(errors, Number.isFinite(steps) && steps >= 0 && steps <= 200000, 'steps is invalid', 'steps');
    collectError(
      errors,
      Number.isFinite(distanceMiles) && distanceMiles >= 0 && distanceMiles <= 200,
      'distanceMiles is invalid',
      'distanceMiles'
    );
    collectError(
      errors,
      Number.isFinite(durationMinutes) && durationMinutes >= 0 && durationMinutes <= 600,
      'durationMinutes is invalid',
      'durationMinutes'
    );
    collectError(
      errors,
      Number.isFinite(bodyWeightKg) && bodyWeightKg >= 20 && bodyWeightKg <= 350,
      'bodyWeightKg is invalid',
      'bodyWeightKg'
    );
    collectError(
      errors,
      ['light', 'moderate', 'intense', 'high'].includes(intensity),
      'intensity is invalid',
      'intensity'
    );
    collectError(errors, Boolean(timestamp), 'timestamp is invalid', 'timestamp');

    throwIfErrors(errors);

    req.validatedBody = {
      steps,
      distanceMiles,
      durationMinutes,
      bodyWeightKg,
      intensity,
      notes,
      timestamp,
    };
    next();
  } catch (error) {
    next(error);
  }
}

function validateWearableSync(req, res, next) {
  try {
    assertNoUnknownFields(req.body, ['provider', 'consentGiven', 'bodyWeightKg', 'entries']);

    const errors = [];
    const provider = String(req.body.provider || '').trim().toLowerCase();
    const consentGiven = Boolean(req.body.consentGiven);
    const bodyWeightKg = toNumber(req.body.bodyWeightKg) ?? 70;
    const entries = Array.isArray(req.body.entries) ? req.body.entries : [];

    collectError(
      errors,
      ['apple-health', 'google-fit', 'smartwatch', 'manual'].includes(provider),
      'provider must be apple-health, google-fit, smartwatch, or manual',
      'provider'
    );
    collectError(errors, consentGiven, 'consentGiven must be true', 'consentGiven');
    collectError(
      errors,
      Number.isFinite(bodyWeightKg) && bodyWeightKg >= 20 && bodyWeightKg <= 350,
      'bodyWeightKg is invalid',
      'bodyWeightKg'
    );
    collectError(errors, entries.length <= 200, 'entries cannot exceed 200', 'entries');

    const normalizedEntries = entries
      .map((entry, index) => {
        if (!entry || typeof entry !== 'object') {
          errors.push({ field: `entries[${index}]`, message: 'Entry must be an object' });
          return null;
        }

        const normalized = {
          workoutType: String(entry.workoutType || entry.activityType || 'cardio').toLowerCase(),
          exercises: normalizeExerciseEntries(entry.exercises || [], errors, `entries[${index}].exercises`),
          steps: toNumber(entry.steps) ?? 0,
          distanceMiles: toNumber(entry.distanceMiles) ?? 0,
          durationMinutes: toNumber(entry.durationMinutes) ?? 0,
          bodyWeightKg: toNumber(entry.bodyWeightKg) ?? bodyWeightKg,
          intensity: String(entry.intensity || 'moderate').toLowerCase(),
          caloriesBurned: toNumber(entry.caloriesBurned) ?? 0,
          notes: String(entry.notes || '').trim(),
          timestamp: normalizeTimestampOrNow(entry.timestamp),
        };

        if (!normalized.timestamp) {
          errors.push({ field: `entries[${index}].timestamp`, message: 'timestamp is invalid' });
        }
        if (normalized.steps < 0 || normalized.steps > 200000) {
          errors.push({ field: `entries[${index}].steps`, message: 'steps is invalid' });
        }
        if (normalized.distanceMiles < 0 || normalized.distanceMiles > 200) {
          errors.push({ field: `entries[${index}].distanceMiles`, message: 'distanceMiles is invalid' });
        }
        if (normalized.durationMinutes < 0 || normalized.durationMinutes > 600) {
          errors.push({
            field: `entries[${index}].durationMinutes`,
            message: 'durationMinutes is invalid',
          });
        }
        if (normalized.bodyWeightKg < 20 || normalized.bodyWeightKg > 350) {
          errors.push({ field: `entries[${index}].bodyWeightKg`, message: 'bodyWeightKg is invalid' });
        }
        if (!['light', 'moderate', 'intense', 'high'].includes(normalized.intensity)) {
          errors.push({ field: `entries[${index}].intensity`, message: 'intensity is invalid' });
        }
        if (normalized.caloriesBurned < 0 || normalized.caloriesBurned > 5000) {
          errors.push({
            field: `entries[${index}].caloriesBurned`,
            message: 'caloriesBurned is invalid',
          });
        }

        return normalized;
      })
      .filter(Boolean);

    throwIfErrors(errors);

    req.validatedBody = {
      provider,
      consentGiven,
      bodyWeightKg,
      entries: normalizedEntries,
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
  validateSearch,
  validateRouteRequest,
  validateCreateActivity,
  validateCreateMeal,
  validateNutritionRemainingQuery,
  validateFoodLookup,
  validateMealBuilderRequest,
  validateCreateRecipe,
  validateCreateRecipeReview,
  validateCalendarPlan,
  validateCalendarDayParam,
  validateExerciseLog,
  validateStepLog,
  validateWearableSync,
};
