const express = require('express');
const router = express.Router();
const moodController = require('../controllers/moodController');

router.post('/mood', moodController.saveMood);
router.get('/mood/weekly/:userId', moodController.getWeeklyMoods);

module.exports = router;
