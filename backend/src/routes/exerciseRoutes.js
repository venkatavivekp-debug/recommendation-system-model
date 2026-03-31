const express = require('express');
const exerciseController = require('../controllers/exerciseController');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  validateExerciseLog,
  validateStepLog,
  validateWearableSync,
} = require('../middleware/validationMiddleware');

const router = express.Router();

router.use(requireAuth);

router.post('/log', validateExerciseLog, exerciseController.logWorkout);
router.post('/steps', validateStepLog, exerciseController.logSteps);
router.post('/sync', validateWearableSync, exerciseController.syncWearable);
router.get('/today', exerciseController.getTodaySummary);
router.get('/history', exerciseController.getHistory);

module.exports = router;
