require('dotenv').config();
const mongoose = require('mongoose');
const FaithContent = require('../src/models/FaithContent');
const seedRecords = require('../src/data/faithContentSeed.json');

const run = async () => {
  const uri = process.env.MONGODB_URI || process.env.MONGODB_LOCAL || 'mongodb://127.0.0.1:27017/mental_health_app';
  console.log('Connecting to MongoDB for seeding...');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  await FaithContent.deleteMany({});
  await FaithContent.insertMany(seedRecords);
  console.log(`Successfully seeded ${seedRecords.length} verified Hadith and Quran faith-content records.`);
  await mongoose.disconnect();
};

run().catch(async error => {
  console.error('Faith-content seed failed:', error.message);
  try {
    await mongoose.disconnect();
  } catch (_) {}
  process.exitCode = 1;
});