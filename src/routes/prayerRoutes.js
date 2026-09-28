const express = require('express');
const router = express.Router();
const prayerController = require('../controllers/prayerController');

router.get('/weekly/:userId', prayerController.getWeeklyPrayerStats);
router.get('/:userId', prayerController.getPrayerStatus);
router.post('/', prayerController.savePrayerStatus);

module.exports = router;
