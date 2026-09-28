const mongoose = require('mongoose');

const moodRecordSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  mood: {
    type: String,
    required: true,
    trim: true
  },
  emoji: {
    type: String,
    required: true
  },
  intensity: {
    type: Number,
    min: 1,
    max: 10,
    default: 5
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('MoodRecord', moodRecordSchema);
