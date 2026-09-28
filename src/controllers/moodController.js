const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const MoodRecord = require('../models/MoodRecord');
const JournalEntry = require('../models/JournalEntry');

const fallbackMoodsFile = path.join(__dirname, '..', '..', 'data', 'moods.json');
const fallbackJournalsFile = path.join(__dirname, '..', '..', 'data', 'journals.json');

const MOOD_EMOJIS = {
  'happy': '😊',
  'excited': '🤩',
  'calm': '🧘',
  'neutral': '😐',
  'sad': '😔',
  'anxious': '😰',
  'bad': '👎',
  'angry': '😡',
  'confused': '😕',
  'worried': '😟',
  'frustrated': '😤',
  'irritated': '😒'
};

const getEmojiForMood = (mood) => {
  if (!mood) return '😐';
  const clean = String(mood).split(' / ')[0].trim().toLowerCase();
  for (const [key, emoji] of Object.entries(MOOD_EMOJIS)) {
    if (clean === key.toLowerCase() || String(mood).toLowerCase().includes(key.toLowerCase())) {
      return emoji;
    }
  }
  return '😐';
};

function isDatabaseReady() {
  return mongoose.connection.readyState === 1;
}

function loadFallbackMoods() {
  try {
    if (fs.existsSync(fallbackMoodsFile)) {
      const data = fs.readFileSync(fallbackMoodsFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load fallback moods:', error.message);
  }
  return [];
}

function saveFallbackMoods(moods) {
  try {
    const dir = path.dirname(fallbackMoodsFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fallbackMoodsFile, JSON.stringify(moods, null, 2));
  } catch (error) {
    console.error('Failed to save fallback moods:', error.message);
  }
}

exports.saveMood = async (req, res) => {
  try {
    const { userId, mood, emoji, intensity } = req.body;
    
    if (!userId || !mood || !emoji) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (isDatabaseReady()) {
      try {
        const newRecord = new MoodRecord({
          userId,
          mood,
          emoji,
          intensity: intensity || 5
        });
        await newRecord.save();
        return res.status(201).json({ success: true, data: newRecord });
      } catch (dbErr) {
        console.error("DB Save Mood failed, trying fallback...", dbErr);
      }
    }

    // Fallback saving
    const newRecord = {
      _id: new mongoose.Types.ObjectId().toString(),
      userId,
      mood,
      emoji,
      intensity: intensity || 5,
      timestamp: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const fallbackMoods = loadFallbackMoods();
    fallbackMoods.push(newRecord);
    saveFallbackMoods(fallbackMoods);

    res.status(201).json({ success: true, data: newRecord });
  } catch (error) {
    console.error("Save Mood Error:", error);
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
};

exports.getWeeklyMoods = async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Get records from the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let moodRecords = [];
    let journalRecords = [];

    if (isDatabaseReady()) {
      try {
        moodRecords = await MoodRecord.find({
          userId,
          timestamp: { $gte: sevenDaysAgo }
        }).lean();
      } catch (dbErr) {
        console.error("DB Get Weekly Moods failed, trying fallback...", dbErr.message);
      }

      try {
        journalRecords = await JournalEntry.find({
          userId,
          timestamp: { $gte: sevenDaysAgo }
        }).lean();
      } catch (dbErr) {
        console.error("DB Get Weekly Journals failed, trying fallback...", dbErr.message);
      }
    }

    if (moodRecords.length === 0) {
      const fallbackMoods = loadFallbackMoods();
      moodRecords = fallbackMoods
        .filter(m => m.userId === userId && new Date(m.timestamp) >= sevenDaysAgo);
    }

    if (journalRecords.length === 0) {
      try {
        if (fs.existsSync(fallbackJournalsFile)) {
          const raw = fs.readFileSync(fallbackJournalsFile, 'utf8');
          const allJournals = JSON.parse(raw);
          journalRecords = allJournals
            .filter(j => j.userId === userId && new Date(j.timestamp) >= sevenDaysAgo);
        }
      } catch (_) {}
    }

    // Convert journal records to mood format
    const convertedJournals = journalRecords.map(j => ({
      _id: j._id ? j._id.toString() : undefined,
      userId: j.userId,
      mood: j.mood,
      emoji: getEmojiForMood(j.mood),
      intensity: j.moodScore || 5,
      timestamp: j.timestamp || j.createdAt,
      source: 'journal',
      feeling: j.feeling
    }));

    // Deduplicate MoodRecords that were created alongside JournalEntries
    const filteredMoodRecords = moodRecords.filter(m => {
      if (m.source === 'journal') return false;
      const mTime = new Date(m.timestamp).getTime();
      // Check if there's an existing journal entry within 5 seconds with same mood
      const duplicateJournal = convertedJournals.some(j => {
        const jTime = new Date(j.timestamp).getTime();
        return Math.abs(mTime - jTime) < 5000 && m.mood === j.mood;
      });
      return !duplicateJournal;
    }).map(m => ({ ...m, source: m.source || 'checkin' }));

    // Combine both and sort chronologically
    const combined = [...filteredMoodRecords, ...convertedJournals];
    combined.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Deduplicate any records with exact same timestamp and mood
    const seen = new Set();
    const deduplicated = [];
    for (const item of combined) {
      const key = `${item.userId}_${new Date(item.timestamp).toISOString()}_${item.mood}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduplicated.push(item);
      }
    }

    const now = new Date();
    const formattedData = deduplicated.map(item => {
      const itemDate = new Date(item.timestamp);
      const diffDays = Math.floor(
        (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
         new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate()).getTime()) /
        (1000 * 60 * 60 * 24)
      );

      let dayLabel = 'Today';
      if (diffDays === 1) {
        dayLabel = 'Yesterday';
      } else if (diffDays > 1) {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        dayLabel = days[itemDate.getDay()];
      }

      const hours = itemDate.getHours();
      const minutes = String(itemDate.getMinutes()).padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      const timeStr = `${formattedHours}:${minutes} ${ampm}`;

      return {
        ...item,
        dayLabel,
        timeStr,
        displayLabel: diffDays === 0 ? `Today ${timeStr}` : (diffDays === 1 ? `Yesterday ${timeStr}` : `${dayLabel} ${timeStr}`)
      };
    });

    res.status(200).json({ success: true, data: formattedData });
  } catch (error) {
    console.error("Get Weekly Moods Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

