const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const contentController = require('../controllers/contentController');

const router = express.Router();

router.use(requireAuth);
router.get('/recommendations', contentController.getRecommendations);
router.post('/feedback', contentController.logFeedback);

module.exports = router;
