const express = require('express');
const calendarController = require('../controllers/calendarController');
const { requireAuth } = require('../middleware/authMiddleware');
const { validateCalendarPlan, validateCalendarDayParam } = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireAuth);

router.get('/history', calendarController.getCalendarHistory);
router.get('/day/:date', validateCalendarDayParam, calendarController.getCalendarDay);
router.post('/plan', validateCalendarPlan, calendarController.createCalendarPlan);
router.get('/upcoming', calendarController.getUpcomingCalendarPlans);

module.exports = router;
