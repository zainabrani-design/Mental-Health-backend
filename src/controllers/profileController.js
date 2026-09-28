const bcrypt = require('bcryptjs');
const { findByEmail, findById, updateUser, toPublic } = require('../utils/userStore');

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const ALLOWED_GENDERS = ['Male', 'Female', 'Other'];

// PUT /api/auth/profile   { name, email, age?, gender? }
const updateProfile = async (req, res) => {
  try {
    const user = await findById(req.userId);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Account not found. Please log in again.' });
    }

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();

    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, message: 'Enter a valid email address' });
    }

    // Age / gender are optional.
    let age;
    if (req.body.age !== undefined && req.body.age !== null && req.body.age !== '') {
      age = Number(req.body.age);
      if (!Number.isInteger(age) || age < 5 || age > 120) {
        return res.status(400).json({ success: false, message: 'Enter a valid age (5-120)' });
      }
    }
    let gender;
    if (req.body.gender) {
      if (!ALLOWED_GENDERS.includes(req.body.gender)) {
        return res.status(400).json({ success: false, message: 'Invalid gender value' });
      }
      gender = req.body.gender;
    }

    // The new email must not belong to someone else.
    if (email !== user.email) {
      const existing = await findByEmail(email);
      if (existing && existing.id !== user.id) {
        return res.status(409).json({ success: false, message: 'This email is already in use' });
      }
    }

    const updated = await updateUser(user, { name, email, age, gender });
    if (!updated) {
      return res.status(400).json({ success: false, message: 'Could not update profile' });
    }

    res.status(200).json({ success: true, user: toPublic(updated) });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ success: false, message: 'Could not update profile' });
  }
};

// POST /api/auth/change-password   { currentPassword, newPassword }
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Provide your current and new password' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }

    const user = await findById(req.userId);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Account not found. Please log in again.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newPassword, salt);
    await updateUser(user, { password: hashed });

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Could not change password' });
  }
};

module.exports = { updateProfile, changePassword };
