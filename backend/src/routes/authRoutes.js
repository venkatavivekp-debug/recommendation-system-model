const express = require('express');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/authMiddleware');
const {
  validateRegister,
  validateVerifyEmail,
  validateLogin,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
} = require('../middleware/validationMiddleware');

const router = express.Router();

router.post('/register', validateRegister, authController.register);
router.post('/verify-email', validateVerifyEmail, authController.verifyEmail);
router.post('/login', validateLogin, authController.login);
router.post('/logout', requireAuth, authController.logout);
router.post('/forgot-password', validateForgotPassword, authController.forgotPassword);
router.post('/reset-password', validateResetPassword, authController.resetPassword);
router.post('/change-password', requireAuth, validateChangePassword, authController.changePassword);

module.exports = router;
