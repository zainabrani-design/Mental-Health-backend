const mongoose = require('mongoose');

const faithContentSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['quran', 'hadith'],
    required: true
  },
  theme: {
    type: String,
    required: true,
    index: true
  },
  arabicText: {
    type: String,
    required: true
  },
  translation: {
    type: String,
    required: true
  },
  translationUrdu: String,
  reference: {
    type: String,
    required: true
  },
  source: {
    type: String,
    required: true
  },
  hadithCollection: String,
  hadithNumber: String,
  authenticity: String,
  explanation: {
    type: String,
    required: true
  },
  explanationUrdu: String,
  priority: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

faithContentSchema.index({ theme: 1, priority: -1 });

module.exports = mongoose.model('FaithContent', faithContentSchema);