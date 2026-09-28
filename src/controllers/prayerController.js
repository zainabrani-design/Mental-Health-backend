const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const PrayerRecord = require('../models/PrayerRecord');

const fallbackPrayersFile = path.join(__dirname, '..', '..', 'data', 'prayers.json');

function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

function loadFallbackPrayers() {
  try {
    if (fs.existsSync(fallbackPrayersFile)) {
      const data = fs.readFileSync(fallbackPrayersFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load fallback prayers:', error.message);
  }
  return [];
}

function saveFallbackPrayers(records) {
  try {
    const dir = path.dirname(fallbackPrayersFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fallbackPrayersFile, JSON.stringify(records, null, 2));
  } catch (error) {
    console.error('Failed to save fallback prayers:', error.message);
  }
}

function getTodayString() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// GET /api/prayer/:userId?date=YYYY-MM-DD
exports.getPrayerStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const date = req.query.date || getTodayString();

    let record = null;

    if (isDatabaseReady()) {
      try {
        record = await PrayerRecord.findOne({ userId, date }).lean();
      } catch (dbErr) {
        console.error('DB get prayer failed, checking fallback:', dbErr.message);
      }
    }

    if (!record) {
      const fallback = loadFallbackPrayers();
      record = fallback.find(r => r.userId === userId && r.date === date);
    }

    if (!record) {
      record = {
        userId,
        date,
        fajr: false,
        dhuhr: false,
        asr: false,
        maghrib: false,
        isha: false,
        allCompleted: false
      };
    }

    res.status(200).json({ success: true, data: record });
  } catch (error) {
    console.error('Get Prayer Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// POST /api/prayer
// Body: { userId, date, fajr, dhuhr, asr, maghrib, isha }
exports.savePrayerStatus = async (req, res) => {
  try {
    const { userId, date, fajr, dhuhr, asr, maghrib, isha } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const targetDate = date || getTodayString();
    const f = Boolean(fajr);
    const d = Boolean(dhuhr);
    const a = Boolean(asr);
    const m = Boolean(maghrib);
    const i = Boolean(isha);
    const allCompleted = f && d && a && m && i;

    let updatedRecord = null;

    if (isDatabaseReady()) {
      try {
        updatedRecord = await PrayerRecord.findOneAndUpdate(
          { userId, date: targetDate },
          {
            $set: {
              fajr: f,
              dhuhr: d,
              asr: a,
              maghrib: m,
              isha: i,
              allCompleted
            }
          },
          { new: true, upsert: true, setDefaultsOnInsert: true }
        ).lean();
      } catch (dbErr) {
        console.error('DB save prayer failed, saving to fallback:', dbErr.message);
      }
    }

    // Always keep fallback synchronized for persistence across restarts
    try {
      const fallback = loadFallbackPrayers();
      const existingIdx = fallback.findIndex(r => r.userId === userId && r.date === targetDate);
      const recordData = {
        userId,
        date: targetDate,
        fajr: f,
        dhuhr: d,
        asr: a,
        maghrib: m,
        isha: i,
        allCompleted,
        updatedAt: new Date().toISOString()
      };

      if (existingIdx >= 0) {
        fallback[existingIdx] = { ...fallback[existingIdx], ...recordData };
      } else {
        fallback.push(recordData);
      }
      saveFallbackPrayers(fallback);
      if (!updatedRecord) updatedRecord = recordData;
    } catch (fsErr) {
      console.error('Fallback sync note:', fsErr.message);
    }

    res.status(200).json({ success: true, data: updatedRecord });
  } catch (error) {
    console.error('Save Prayer Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// GET /api/prayer/weekly/:userId
exports.getWeeklyPrayerStats = async (req, res) => {
  try {
    const { userId } = req.params;

    // Calculate dates for past 7 days
    const dates = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      dates.push(`${year}-${month}-${day}`);
    }

    let dbRecords = [];
    if (isDatabaseReady()) {
      try {
        dbRecords = await PrayerRecord.find({
          userId,
          date: { $in: dates }
        }).lean();
      } catch (_) {}
    }

    const fallback = loadFallbackPrayers();
    const fallbackMap = new Map();
    fallback.filter(r => r.userId === userId).forEach(r => fallbackMap.set(r.date, r));

    const dbMap = new Map();
    dbRecords.forEach(r => dbMap.set(r.date, r));

    const result = dates.map(dateStr => {
      const rec = dbMap.get(dateStr) || fallbackMap.get(dateStr) || {
        userId,
        date: dateStr,
        fajr: false,
        dhuhr: false,
        asr: false,
        maghrib: false,
        isha: false,
        allCompleted: false
      };

      let completedCount = 0;
      if (rec.fajr) completedCount++;
      if (rec.dhuhr) completedCount++;
      if (rec.asr) completedCount++;
      if (rec.maghrib) completedCount++;
      if (rec.isha) completedCount++;

      return {
        ...rec,
        completedCount,
        total: 5
      };
    });

    res.status(200).json({ success: true, data: result });
  } catch (error) {
    console.error('Get Weekly Prayer Stats Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
