const express = require('express');
const shareController = require('../controllers/shareController');
const { requireAuth } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(requireAuth);

router.post('/email', shareController.shareViaEmail);

module.exports = router;
