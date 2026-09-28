const express = require('express');
const router = express.Router();
const { processChat } = require('../controllers/chatController');

// @route   POST /api/chat
// @desc    Process a CBT chat message
// @access  Public
router.post('/chat', processChat);

module.exports = router;
