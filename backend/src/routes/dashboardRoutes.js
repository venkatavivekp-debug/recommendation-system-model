const express = require('express');
const dashboardController = require('../controllers/dashboardController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', requireAuth, dashboardController.getDashboardSummary);

module.exports = router;
