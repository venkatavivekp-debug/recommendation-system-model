const express = require('express');
const adminController = require('../controllers/adminController');
const { requireAuth, checkRole } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(requireAuth, checkRole(['admin']));

router.get('/users', adminController.getAllUsers);
router.put('/users/:id/role', adminController.changeUserRole);
router.get('/restaurants', adminController.getAllRestaurants);
router.get('/content-metrics', adminController.getContentModelPerformance);
router.get('/model-metrics', adminController.getRecommendationModelAnalysis);
router.get('/model-analysis', adminController.getRecommendationModelAnalysis);
router.delete('/recipes/:id', adminController.deleteRecipe);

module.exports = router;
