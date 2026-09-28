const bcrypt = require('bcryptjs');
const { findByEmail, updateUser } = require('../utils/userStore');

// POST /api/auth/reset-password   { email, newPassword }
// Simple reset (no verification code): the user enters their email and a new password.
const resetPassword = async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const newPassword = String(req.body.newPassword || '');

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const user = await findByEmail(email);
    if (!user) {
      return res.status(400).json({ success: false, message: 'No account found with this email' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);
    await updateUser(user, { password: hashed });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Could not reset password' });
  }
};

module.exports = { resetPassword };