const express = require('express');
const activityController = require('../controllers/activityController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateCreateActivity } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireAuth);

router.get('/', activityController.listActivities);
router.post('/', validateCreateActivity, activityController.createActivity);

module.exports = router;
