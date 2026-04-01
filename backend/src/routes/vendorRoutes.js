const express = require('express');
const vendorController = require('../controllers/vendorController');
const { requireAuth, checkRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(requireAuth, checkRole(['vendor']));

router.post('/restaurant', vendorController.createRestaurant);
router.put('/restaurant/:id', vendorController.updateRestaurant);
router.get('/restaurant', vendorController.getRestaurants);

module.exports = router;
