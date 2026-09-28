const mongoose = require('mongoose');

const journalEntrySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true // Efficient querying per user
  },
  feeling: {
    type: String,
    required: true,
    trim: true
  },
  mood: {
    type: String,
    required: true
  },
  moodScore: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  faithMotivation: {
    type: { type: String, enum: ['quran', 'hadith'] },
    theme: String,
    arabicText: String,
    translation: String,
    translationUrdu: String,
    reference: String,
    source: String,
    authenticity: String,
    explanation: String,
    explanationUrdu: String,
    personalizedNote: String
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true // Efficient range queries for weekly reports
  }
}, {
  timestamps: true // Adds createdAt and updatedAt
});

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
