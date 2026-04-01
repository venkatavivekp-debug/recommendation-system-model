const { randomUUID } = require('crypto');
const AppError = require('../utils/appError');
const restaurantModel = require('../models/restaurantModel');

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeText(value, maxLen = 220) {
  return String(value || '').trim().slice(0, maxLen);
}

function normalizeMenu(menu) {
  const items = Array.isArray(menu) ? menu : [];
  return items
    .map((item) => ({
      name: normalizeText(item?.name, 80),
      description: normalizeText(item?.description, 280),
      calories: Math.max(0, toNumber(item?.calories, 0)),
      protein: Math.max(0, toNumber(item?.protein, 0)),
      carbs: Math.max(0, toNumber(item?.carbs, 0)),
      fats: Math.max(0, toNumber(item?.fats, 0)),
      fiber: Math.max(0, toNumber(item?.fiber, 0)),
      price: Math.max(0, toNumber(item?.price, 0)),
    }))
    .filter((item) => item.name.length > 0)
    .slice(0, 120);
}

function averageCalories(menu) {
  if (!menu.length) {
    return 0;
  }

  const sum = menu.reduce((total, item) => total + Number(item.calories || 0), 0);
  return Number((sum / menu.length).toFixed(0));
}

function validateRestaurantPayload(payload, isUpdate = false) {
  const name = normalizeText(payload.name, 90);
  const cuisine = normalizeText(payload.cuisine, 60);
  const description = normalizeText(payload.description, 500);
  const website = normalizeText(payload.website, 240);
  const contact = normalizeText(payload.contact, 140);
  const rating = Math.min(5, Math.max(0, toNumber(payload.rating, 0)));
  const menu = normalizeMenu(payload.menu);

  if (!isUpdate) {
    if (!name) {
      throw new AppError('Restaurant name is required', 400, 'VALIDATION_ERROR');
    }
    if (!cuisine) {
      throw new AppError('Cuisine is required', 400, 'VALIDATION_ERROR');
    }
  }

  return {
    ...(name ? { name } : {}),
    ...(cuisine ? { cuisine } : {}),
    ...(description ? { description } : {}),
    ...(website ? { website } : {}),
    ...(contact ? { contact } : {}),
    ...(payload.rating !== undefined ? { rating } : {}),
    ...(Array.isArray(payload.menu) ? { menu } : {}),
    ...(Array.isArray(payload.menu) ? { estimatedCalories: averageCalories(menu) } : {}),
  };
}

async function createRestaurant(ownerId, payload) {
  const normalized = validateRestaurantPayload(payload, false);
  const now = new Date().toISOString();

  const created = await restaurantModel.createRestaurant({
    id: randomUUID(),
    ownerId,
    name: normalized.name,
    cuisine: normalized.cuisine,
    description: normalized.description || '',
    menu: normalized.menu || [],
    website: normalized.website || '',
    contact: normalized.contact || '',
    rating: normalized.rating || 0,
    estimatedCalories: normalized.estimatedCalories || averageCalories(normalized.menu || []),
    createdAt: now,
    updatedAt: now,
  });

  return created;
}

async function updateRestaurant(ownerId, restaurantId, payload) {
  const existing = await restaurantModel.findRestaurantById(restaurantId);
  if (!existing) {
    throw new AppError('Restaurant not found', 404, 'NOT_FOUND');
  }

  if (existing.ownerId !== ownerId) {
    throw new AppError('You can only update your own restaurant', 403, 'FORBIDDEN');
  }

  const updates = validateRestaurantPayload(payload, true);
  if (!Object.keys(updates).length) {
    throw new AppError('No valid fields to update', 400, 'VALIDATION_ERROR');
  }

  const updated = await restaurantModel.updateRestaurantById(restaurantId, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });

  return updated;
}

async function listVendorRestaurants(ownerId) {
  const restaurants = await restaurantModel.listRestaurantsByOwner(ownerId, 200);
  return { restaurants };
}

module.exports = {
  createRestaurant,
  updateRestaurant,
  listVendorRestaurants,
};
