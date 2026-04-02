const express = require('express');
const foodController = require('../controllers/foodController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateFoodLookup } = require('../middleware/validationMiddleware');
const { uploadFoodMedia } = require('../middleware/uploadMiddleware');

const router = express.Router();

router.use(requireAuth);

router.post('/lookup', validateFoodLookup, foodController.lookupFood);
router.post('/search', validateFoodLookup, foodController.searchGlobalFoods);
router.post('/detect', uploadFoodMedia, foodController.detectFood);
router.post('/resolve', validateFoodLookup, foodController.resolveFood);

module.exports = router;
