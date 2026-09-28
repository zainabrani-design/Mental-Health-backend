const jwt = require('jsonwebtoken');

// Must be the same secret authController.js uses to sign tokens.
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key_for_mental_health_app';

// Reads "Authorization: Bearer <token>" and puts the user id on req.userId.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, message: 'Please log in again.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Your session has expired. Please log in again.' });
  }
}

module.exports = requireAuth;
