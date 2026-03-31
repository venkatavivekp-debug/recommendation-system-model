const express = require('express');
const mealController = require('../controllers/mealController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateCreateMeal } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireAuth);

router.post('/', validateCreateMeal, mealController.createMeal);
router.put('/:mealId', validateCreateMeal, mealController.updateMeal);
router.delete('/:mealId', mealController.deleteMeal);
router.get('/today', mealController.getTodayMeals);
router.get('/history', mealController.getMealHistory);

module.exports = router;
