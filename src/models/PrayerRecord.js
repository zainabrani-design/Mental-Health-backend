const mongoose = require('mongoose');

const prayerRecordSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true
  },
  date: {
    type: String, // YYYY-MM-DD
    required: true,
    index: true
  },
  fajr: {
    type: Boolean,
    default: false
  },
  dhuhr: {
    type: Boolean,
    default: false
  },
  asr: {
    type: Boolean,
    default: false
  },
  maghrib: {
    type: Boolean,
    default: false
  },
  isha: {
    type: Boolean,
    default: false
  },
  allCompleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

prayerRecordSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('PrayerRecord', prayerRecordSchema);
