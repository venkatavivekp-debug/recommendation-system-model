const express = require('express');
const searchController = require('../controllers/searchController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateSearch } = require('../middleware/validationMiddleware');

const router = express.Router();

router.post('/', requireAuth, validateSearch, searchController.search);

module.exports = router;
