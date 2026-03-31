const express = require('express');
const routeController = require('../controllers/routeController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateRouteRequest } = require('../middleware/validationMiddleware');

const router = express.Router();

router.post('/', requireAuth, validateRouteRequest, routeController.getRouteSummary);

module.exports = router;
