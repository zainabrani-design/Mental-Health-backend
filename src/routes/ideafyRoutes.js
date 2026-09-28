const express = require('express');
const { processIdeafy } = require('../controllers/ideafyController');

const router = express.Router();

// @route   POST /api/ideafy
// @desc    Analyze five Ideafy answers and attach an optional faith reminder
// @access  Public (consistent with the existing API)
router.post('/ideafy', processIdeafy);

module.exports = router;