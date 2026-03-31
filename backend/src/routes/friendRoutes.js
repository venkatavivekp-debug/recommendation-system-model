const express = require('express');
const friendController = require('../controllers/friendController');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  validateFriendRequest,
  validateFriendAction,
  validateFriendSearchQuery,
} = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireAuth);

router.post('/request', validateFriendRequest, friendController.requestFriend);
router.post('/accept', validateFriendAction, friendController.acceptFriend);
router.post('/reject', validateFriendAction, friendController.rejectFriend);
router.get('/list', friendController.listFriends);
router.get('/requests', friendController.listRequests);
router.get('/search', validateFriendSearchQuery, friendController.searchUsers);

module.exports = router;
