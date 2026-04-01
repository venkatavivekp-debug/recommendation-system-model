const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const vendorService = require('../services/vendorService');

const createRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await vendorService.createRestaurant(req.auth.userId, req.body || {});
  return sendSuccess(res, { restaurant }, 'Restaurant created', 201);
});

const updateRestaurant = asyncHandler(async (req, res) => {
  const restaurant = await vendorService.updateRestaurant(
    req.auth.userId,
    req.params.id,
    req.body || {}
  );
  return sendSuccess(res, { restaurant }, 'Restaurant updated');
});

const getRestaurants = asyncHandler(async (req, res) => {
  const data = await vendorService.listVendorRestaurants(req.auth.userId);
  return sendSuccess(res, data, 'Vendor restaurants retrieved');
});

module.exports = {
  createRestaurant,
  updateRestaurant,
  getRestaurants,
};
