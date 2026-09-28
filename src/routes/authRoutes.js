const express = require('express');
const router = express.Router();
const { registerUser, loginUser } = require('../controllers/authController');
const { resetPassword } = require('../controllers/passwordResetController');
const { updateProfile, changePassword } = require('../controllers/profileController');
const requireAuth = require('../middleware/authMiddleware');

router.post('/register', registerUser);
router.post('/login', loginUser);

// Forgot password: set a new password using only the account email (no login needed)
router.post('/reset-password', resetPassword);

// Profile (login required)
router.put('/profile', requireAuth, updateProfile);
router.post('/change-password', requireAuth, changePassword);

module.exports = router;