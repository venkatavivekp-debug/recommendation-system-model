const express = require('express');
const chatController = require('../controllers/chatController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateChatSend, validateChatQuery } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireAuth);
router.post('/send', validateChatSend, chatController.sendMessage);
router.get('/messages', validateChatQuery, chatController.getMessages);

module.exports = router;
