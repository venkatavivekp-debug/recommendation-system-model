const express = require('express');
const mealBuilderController = require('../controllers/mealBuilderController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateMealBuilderRequest } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireAuth);

router.post('/', validateMealBuilderRequest, mealBuilderController.buildMealPlan);
router.post('/recipes', validateMealBuilderRequest, mealBuilderController.buildRecipeSuggestions);

module.exports = router;
