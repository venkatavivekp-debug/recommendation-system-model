const express = require('express');
const communityController = require('../controllers/communityController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateRecipeShare } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireAuth);

router.post('/share', validateRecipeShare, communityController.shareRecipe);
router.get('/friends', communityController.listFriendRecipes);
router.get('/public', communityController.listPublicRecipes);

module.exports = router;
