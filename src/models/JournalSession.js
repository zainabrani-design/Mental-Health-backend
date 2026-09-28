const mongoose = require('mongoose');

const journalSessionSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  journalText: {
    type: String,
    default: ''
  },
  mainEmotion: {
    type: String
  },
  emotionIntensity: {
    type: Number,
    min: 0,
    max: 100
  },
  trigger: {
    type: String
  },
  automaticThought: {
    type: String
  },
  coreBelief: {
    type: String
  },
  cognitiveDistortion: {
    type: String
  },
  cbtTechniqueUsed: {
    type: String
  },
  reflectionSummary: {
    type: String
  },
  moodBefore: {
    type: Number,
    min: 0,
    max: 100
  },
  moodAfter: {
    type: Number,
    min: 0,
    max: 100
  },
  todayGoal: {
    type: String
  },
  goalStatus: {
    type: String,
    enum: ['Pending', 'Completed', 'Partial', 'Missed'],
    default: 'Pending'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('JournalSession', journalSessionSchema);
