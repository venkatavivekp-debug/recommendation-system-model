const express = require('express');
const searchController = require('../controllers/searchController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateSearch } = require('../middleware/validationMiddleware');

const router = express.Router();

router.get('/', requireAuth, validateSearch, searchController.search);
router.post('/', requireAuth, validateSearch, searchController.search);

module.exports = router;
