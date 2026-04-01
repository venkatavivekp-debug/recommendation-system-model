const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const adminService = require('../services/adminService');

const getAllUsers = asyncHandler(async (req, res) => {
  const data = await adminService.listAllUsers();
  return sendSuccess(res, data, 'Users retrieved');
});

const getAllRestaurants = asyncHandler(async (req, res) => {
  const data = await adminService.listAllRestaurants();
  return sendSuccess(res, data, 'Restaurants retrieved');
});

const deleteRecipe = asyncHandler(async (req, res) => {
  const data = await adminService.removeRecipe(req.params.id);
  return sendSuccess(res, data, 'Recipe removed');
});

const changeUserRole = asyncHandler(async (req, res) => {
  const data = await adminService.updateUserRole(req.params.id, req.body?.role);
  return sendSuccess(res, data, 'User role updated');
});

module.exports = {
  getAllUsers,
  getAllRestaurants,
  deleteRecipe,
  changeUserRole,
};
