const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_for_mental_health_app';
const fallbackUsersFile = path.join(__dirname, '..', '..', 'data', 'users.json');

function loadFallbackUsers() {
  try {
    if (fs.existsSync(fallbackUsersFile)) {
      const data = fs.readFileSync(fallbackUsersFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load fallback users:', error.message);
  }
  return [];
}

function saveFallbackUsers(users) {
  try {
    const dir = path.dirname(fallbackUsersFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fallbackUsersFile, JSON.stringify(users, null, 2));
  } catch (error) {
    console.error('Failed to save fallback users:', error.message);
  }
}

// Strict check: Only use DB if readyState is 1 (Connected)
function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Provide email and password' });
    }

    let user = null;
    const normalizedEmail = email.toLowerCase();

    if (isDatabaseReady()) {
      try {
        // Use a max timeout for the query itself
        user = await User.findOne({ email: normalizedEmail }).maxTimeMS(2000);
      } catch (dbErr) {
        console.error('DB Query failed, trying fallback...');
      }
    }

    if (!user) {
      const fallbackUsers = loadFallbackUsers();
      user = fallbackUsers.find(u => u.email === normalizedEmail);
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user._id || user.id }, JWT_SECRET, { expiresIn: '30d' });

    res.status(200).json({
      success: true,
      token,
      user: { id: user._id || user.id, name: user.name, email: user.email, age: user.age, gender: user.gender }
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error', error: error.message });
  }
};

const ALLOWED_GENDERS = ['Male', 'Female', 'Other'];

const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Provide name, email and password' });
    }
    const normalizedEmail = email.toLowerCase();

    // Optional profile details collected by the registration form
    const ageNumber = Number(req.body.age);
    const age = Number.isInteger(ageNumber) && ageNumber >= 5 && ageNumber <= 120 ? ageNumber : undefined;
    const gender = ALLOWED_GENDERS.includes(req.body.gender) ? req.body.gender : undefined;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (isDatabaseReady()) {
      try {
        const user = await User.create({ name, email: normalizedEmail, password: hashedPassword, age, gender });
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '30d' });
        return res.status(201).json({ success: true, token, user: { id: user._id, name, email: normalizedEmail, age, gender } });
      } catch (dbErr) {
        // Duplicate email in the database: do not create a second account in the fallback file.
        if (dbErr && dbErr.code === 11000) {
          return res.status(400).json({ success: false, message: 'User already exists' });
        }
        console.error('DB Registration failed, using fallback...');
      }
    }

    // Fallback registration
    const fallbackUsers = loadFallbackUsers();
    if (fallbackUsers.find(u => u.email === normalizedEmail)) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const newUser = { id: Date.now().toString(), name, email: normalizedEmail, password: hashedPassword, age, gender };
    fallbackUsers.push(newUser);
    saveFallbackUsers(fallbackUsers);

    const token = jwt.sign({ id: newUser.id }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ success: true, token, user: { id: newUser.id, name, email: normalizedEmail, age, gender } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Registration Error' });
  }
};

module.exports = { loginUser, registerUser };
