const express = require('express');
const communityController = require('../controllers/communityController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateCreateRecipe, validateCreateRecipeReview } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireAuth);

router.get('/recipes', communityController.listRecipes);
router.get('/recipes/:recipeId', communityController.getRecipe);
router.post('/recipes', validateCreateRecipe, communityController.createRecipe);
router.post('/recipes/:recipeId/reviews', validateCreateRecipeReview, communityController.addReview);
router.post('/recipes/:recipeId/save', communityController.toggleSave);

module.exports = router;
