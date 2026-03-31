const express = require('express');
const authRoutes = require('./authRoutes');
const profileRoutes = require('./profileRoutes');
const searchRoutes = require('./searchRoutes');
const routeRoutes = require('./routeRoutes');
const activityRoutes = require('./activityRoutes');
const dashboardRoutes = require('./dashboardRoutes');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Food + Fitness API is healthy',
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

module.exports = router;
