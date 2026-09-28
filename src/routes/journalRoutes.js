const express = require('express');
const router = express.Router();
const { saveEntry, getEntries, getWeeklyReport } = require('../controllers/journalController');

// @route   POST /api/journal
// @desc    Save a new journal entry and receive motivating Hadith or Ayat
router.post('/journal', saveEntry);

// @route   GET /api/journal
// @desc    Get user's past journal entries
router.get('/journal', getEntries);

// @route   GET /api/weekly-report
// @desc    Get AI-generated weekly emotional summary
router.get('/weekly-report', getWeeklyReport);

module.exports = router;
