const express = require('express');
const { requireAuth } = require('../middleware/authMiddleware');
const iotController = require('../controllers/iotController');

const router = express.Router();

router.use(requireAuth);

router.get('/context', iotController.getContext);
router.put('/preferences', iotController.updatePreferences);
router.post('/sync', iotController.syncData);

module.exports = router;

