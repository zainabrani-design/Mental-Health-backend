const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');

// Same fallback file that authController.js already uses.
const fallbackUsersFile = path.join(__dirname, '..', '..', 'data', 'users.json');

function loadFallbackUsers() {
  try {
    if (fs.existsSync(fallbackUsersFile)) {
      return JSON.parse(fs.readFileSync(fallbackUsersFile, 'utf8'));
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

function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

// Plain object used by the controllers: { id, name, email, password, age, gender, source }
function normalize(raw, source) {
  return {
    id: String(raw._id || raw.id),
    name: raw.name,
    email: raw.email,
    password: raw.password,
    age: raw.age,
    gender: raw.gender,
    source,
  };
}

// What we send back to the app (never the password hash).
function toPublic(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    age: user.age,
    gender: user.gender,
  };
}

async function findByEmail(email) {
  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedEmail) return null;

  if (isDatabaseReady()) {
    try {
      const doc = await User.findOne({ email: normalizedEmail }).maxTimeMS(2000);
      if (doc) return normalize(doc, 'db');
    } catch (err) {
      console.error('DB query failed, trying fallback...');
    }
  }
  const found = loadFallbackUsers().find((u) => u.email === normalizedEmail);
  return found ? normalize(found, 'file') : null;
}

async function findById(id) {
  const userId = String(id || '');
  if (!userId) return null;

  if (isDatabaseReady() && mongoose.Types.ObjectId.isValid(userId)) {
    try {
      const doc = await User.findById(userId).maxTimeMS(2000);
      if (doc) return normalize(doc, 'db');
    } catch (err) {
      console.error('DB query failed, trying fallback...');
    }
  }
  const found = loadFallbackUsers().find((u) => String(u.id) === userId);
  return found ? normalize(found, 'file') : null;
}

// Applies `fields` (name, email, age, gender, password) to the user, wherever it is stored.
async function updateUser(user, fields) {
  const clean = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) clean[key] = value;
  }

  if (user.source === 'db') {
    const doc = await User.findByIdAndUpdate(user.id, clean, { new: true, runValidators: true });
    return doc ? normalize(doc, 'db') : null;
  }

  const users = loadFallbackUsers();
  const index = users.findIndex((u) => String(u.id) === user.id);
  if (index === -1) return null;
  users[index] = { ...users[index], ...clean };
  saveFallbackUsers(users);
  return normalize(users[index], 'file');
}

module.exports = { findByEmail, findById, updateUser, toPublic, isDatabaseReady };
