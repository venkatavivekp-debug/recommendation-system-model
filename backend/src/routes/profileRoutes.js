const express = require('express');
const profileController = require('../controllers/profileController');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  validateProfileUpdate,
  validateAddCard,
  validateUpdateCard,
} = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireAuth);

router.get('/me', profileController.getMe);
router.put('/me', validateProfileUpdate, profileController.updateMe);
router.post('/me/cards', validateAddCard, profileController.addCard);
router.put('/me/cards/:cardId', validateUpdateCard, profileController.updateCard);
router.delete('/me/cards/:cardId', profileController.removeCard);

module.exports = router;
