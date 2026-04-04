const express = require('express');
const authRoutes = require('./authRoutes');
const profileRoutes = require('./profileRoutes');
const searchRoutes = require('./searchRoutes');
const routeRoutes = require('./routeRoutes');
const activityRoutes = require('./activityRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const mealRoutes = require('./mealRoutes');
const nutritionRoutes = require('./nutritionRoutes');
const foodRoutes = require('./foodRoutes');
const mealBuilderRoutes = require('./mealBuilderRoutes');
const calendarRoutes = require('./calendarRoutes');
const communityRoutes = require('./communityRoutes');
const exerciseRoutes = require('./exerciseRoutes');
const shareRoutes = require('./shareRoutes');
const adminRoutes = require('./adminRoutes');
const vendorRoutes = require('./vendorRoutes');
const contentRoutes = require('./contentRoutes');
const iotRoutes = require('./iotRoutes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    success: true,
    message: 'ContextFit API is healthy',
    data: {
      timestamp: new Date().toISOString(),
    },
  });
});

router.use('/auth', authRoutes);
router.use('/profile', profileRoutes);
router.use('/search', searchRoutes);
router.use('/routes', routeRoutes);
router.use('/activities', activityRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/meals', mealRoutes);
router.use('/nutrition', nutritionRoutes);
router.use('/food', foodRoutes);
router.use('/meal-builder', mealBuilderRoutes);
router.use('/calendar', calendarRoutes);
router.use('/community', communityRoutes);
router.use('/exercises', exerciseRoutes);
router.use('/exercise', exerciseRoutes);
router.use('/share', shareRoutes);
router.use('/content', contentRoutes);
router.use('/iot', iotRoutes);
router.use('/admin', adminRoutes);
router.use('/vendor', vendorRoutes);

module.exports = router;
