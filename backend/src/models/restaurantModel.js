const { isMongoEnabled } = require('../config/database');
const RestaurantDocument = require('./mongo/restaurantDocument');
const dataStore = require('./dataStore');

async function createRestaurant(record) {
  if (isMongoEnabled()) {
    const created = await RestaurantDocument.create(record);
    return created.toObject();
  }

  await dataStore.updateData((data) => {
    data.restaurants = data.restaurants || [];
    data.restaurants.push(record);
    return data;
  });

  return record;
}

async function listRestaurants(limit = 200) {
  if (isMongoEnabled()) {
    return RestaurantDocument.find({}).sort({ createdAt: -1 }).limit(limit).lean();
  }

  const data = await dataStore.readData();
  return (data.restaurants || [])
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function listRestaurantsByOwner(ownerId, limit = 200) {
  if (isMongoEnabled()) {
    return RestaurantDocument.find({ ownerId }).sort({ createdAt: -1 }).limit(limit).lean();
  }

  const data = await dataStore.readData();
  return (data.restaurants || [])
    .filter((item) => item.ownerId === ownerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, limit);
}

async function findRestaurantById(restaurantId) {
  if (isMongoEnabled()) {
    return RestaurantDocument.findOne({ id: restaurantId }).lean();
  }

  const data = await dataStore.readData();
  return (data.restaurants || []).find((item) => item.id === restaurantId) || null;
}

async function updateRestaurantById(restaurantId, updates) {
  if (isMongoEnabled()) {
    return RestaurantDocument.findOneAndUpdate({ id: restaurantId }, updates, { new: true }).lean();
  }

  let updated = null;
  await dataStore.updateData((data) => {
    data.restaurants = data.restaurants || [];
    const index = data.restaurants.findIndex((item) => item.id === restaurantId);
    if (index === -1) {
      return data;
    }

    data.restaurants[index] = {
      ...data.restaurants[index],
      ...updates,
    };
    updated = data.restaurants[index];
    return data;
  });

  return updated;
}

module.exports = {
  createRestaurant,
  listRestaurants,
  listRestaurantsByOwner,
  findRestaurantById,
  updateRestaurantById,
};
