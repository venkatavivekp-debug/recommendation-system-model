const express = require('express');
const shareController = require('../controllers/shareController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateDietShare } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireAuth);

router.post('/diet', validateDietShare, shareController.shareDiet);
router.get('/diet/inbox', shareController.getSharedDietInbox);

module.exports = router;
