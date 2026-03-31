const express = require('express');
const nutritionController = require('../controllers/nutritionController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateNutritionRemainingQuery } = require('../middleware/validationMiddleware');

const router = express.Router();

router.get('/remaining', requireAuth, validateNutritionRemainingQuery, nutritionController.getRemainingNutrition);

module.exports = router;
