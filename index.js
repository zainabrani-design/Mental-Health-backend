require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const chatRoutes = require('./src/routes/chatRoutes');
const journalRoutes = require('./src/routes/journalRoutes');
const moodRoutes = require('./src/routes/moodRoutes');
const authRoutes = require('./src/routes/authRoutes');
const ideafyRoutes = require('./src/routes/ideafyRoutes');
const prayerRoutes = require('./src/routes/prayerRoutes');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', chatRoutes);
app.use('/api', journalRoutes);
app.use('/api', moodRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', ideafyRoutes);
app.use('/api/prayer', prayerRoutes);

app.get('/', (req, res) => {
  res.send('AI Mental Health API is running. Status: ' + (mongoose.connection.readyState === 1 ? 'Connected to DB' : 'Offline Mode'));
});

// Database Connection
const dbOptions = {
  serverSelectionTimeoutMS: 5000,
};

const primaryUri = process.env.MONGODB_URI;
const localFallback = process.env.MONGODB_LOCAL || 'mongodb://127.0.0.1:27017/mental_health_app';

const FaithContent = require('./src/models/FaithContent');
const seedRecords = require('./src/data/faithContentSeed.json');

async function seedFaithContentIfEmpty() {
  try {
    const count = await FaithContent.countDocuments();
    if (count === 0) {
      await FaithContent.insertMany(seedRecords);
      console.log(`🍃 Auto-seeded ${seedRecords.length} faith content records.`);
    }
  } catch (seedErr) {
    console.warn('Faith content auto-seed note:', seedErr.message);
  }
}

async function startServer() {
  console.log('Attempting to connect to MongoDB...');

  // Disable buffering globally so requests fail/fallback immediately if DB is down
  mongoose.set('bufferCommands', false);

  try {
    await mongoose.connect(primaryUri, dbOptions);
    console.log('🍃 MongoDB Connected (primary)');
    await seedFaithContentIfEmpty();
  } catch (primaryErr) {
    console.error('❌ Primary MongoDB failed:', primaryErr.message);
    console.error('MongoDB error code:', primaryErr.code);
    console.error('Trying local...');
    try {
      await mongoose.connect(localFallback, dbOptions);
      console.log('🍃 MongoDB Connected (local)');
      await seedFaithContentIfEmpty();
    } catch (localErr) {
      console.error('❌ Local MongoDB failed. Starting Memory Server...');
      try {
        const { MongoMemoryServer } = require('mongodb-memory-server');
        const mongoServer = await MongoMemoryServer.create();
        const mongoUri = mongoServer.getUri();
        await mongoose.connect(mongoUri, dbOptions);
        console.log('🍃 MongoDB Connected (in-memory fallback)');
        await seedFaithContentIfEmpty();
      } catch (memErr) {
        console.error('⚠️ All DB connections failed. RUNNING IN OFFLINE MODE.');
      }
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}

startServer();
