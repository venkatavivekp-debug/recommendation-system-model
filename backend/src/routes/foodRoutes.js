const express = require('express');
const foodController = require('../controllers/foodController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateFoodLookup } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireAuth);

router.post('/lookup', validateFoodLookup, foodController.lookupFood);
router.post('/search', validateFoodLookup, foodController.searchGlobalFoods);

module.exports = router;
