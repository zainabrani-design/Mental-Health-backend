const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const JournalEntry = require('../models/JournalEntry');
const FaithContent = require('../models/FaithContent');
const MoodRecord = require('../models/MoodRecord');
const { getAIClient, MODEL_NAME } = require('../config/aiConfig');

const fallbackJournalsFile = path.join(__dirname, '..', '..', 'data', 'journals.json');
const fallbackMoodsFile = path.join(__dirname, '..', '..', 'data', 'moods.json');
const seedRecords = require('../data/faithContentSeed.json');

const MOOD_EMOJIS = {
  'Happy': '😊',
  'Excited': '🤩',
  'Calm': '🧘',
  'Neutral': '😐',
  'Sad': '😔',
  'Anxious': '😰',
  'Bad': '👎',
  'Angry': '😡',
  'Confused': '😕',
  'Worried': '😟',
  'Frustrated': '😤',
  'Irritated': '😒'
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

function loadFallbackJournals() {
  try {
    if (fs.existsSync(fallbackJournalsFile)) {
      const data = fs.readFileSync(fallbackJournalsFile, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Failed to load fallback journals:', error.message);
  }
  return [];
}

function saveFallbackJournals(entries) {
  try {
    const dir = path.dirname(fallbackJournalsFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fallbackJournalsFile, JSON.stringify(entries, null, 2));
  } catch (error) {
    console.error('Failed to save fallback journals:', error.message);
  }
}

/**
 * Fast, reliable heuristic emotional theme detector from thoughts (feeling) and mood
 */
function detectThemeFromFeelingAndMood(feeling = '', mood = '', moodScore = 5) {
  const text = `${feeling} ${mood}`.toLowerCase();
  
  if (/anger|angry|frustrat|irritat|mad|furious|annoy|rage/i.test(text)) return 'anger';
  if (/anxio|panic|nervous|worry|worried|fear|scared|dread|stress|overwhelm/i.test(text)) return 'anxiety';
  if (/lonel|alone|isolated|nobody|abandon/i.test(text)) return 'loneliness';
  if (/guilt|regret|ashamed|shame|sorry|blame|fault/i.test(text)) return 'guilt';
  if (/hopeless|give up|giving up|pointless|no way out|despair/i.test(text)) return 'hopelessness';
  if (/tired|exhaust|burnout|fatigue|drained|weak|heavy/i.test(text)) return 'strength';
  if (/sad|cry|crying|depress|heartbreak|unhappy|down|grief|mourn/i.test(text)) return 'sadness';
  if (/happy|joy|grateful|thankful|blessed|content|peaceful|alhamdulillah/i.test(text)) return 'gratitude';
  if (/calm|relax|seren/i.test(text)) return 'trust_in_allah';

  const m = (mood || '').toLowerCase();
  if (m.includes('happy')) return 'gratitude';
  if (m.includes('calm')) return 'trust_in_allah';
  if (m.includes('sad')) return 'sadness';
  if (m.includes('anxio') || m.includes('worried')) return 'anxiety';
  if (m.includes('angry') || m.includes('frustrated') || m.includes('irritated')) return 'anger';

  if (moodScore <= 3) return 'patience';
  if (moodScore >= 8) return 'gratitude';
  return 'trust_in_allah';
}

/**
 * Uses Gemini to classify theme and create a 1-2 sentence gentle, compassionate reflection
 * connecting the user's written thoughts and mood to the spiritual motivation.
 */
async function analyzeJournalWithGemini(feeling, mood, moodScore, locale = 'en') {
  if (!process.env.GEMINI_API_KEY) {
    return {
      theme: detectThemeFromFeelingAndMood(feeling, mood, moodScore),
      personalizedNote: locale === 'ur'
        ? 'یہ آیت و حدیث آپ کے آج کے احساسات کو سکون اور حوصلہ دینے کے لیے منتخب کی گئی ہے۔'
        : 'This reminder was chosen to bring peace and comfort to what you shared today.'
    };
  }

  try {
    const client = getAIClient(process.env.GEMINI_API_KEY);
    const isUr = locale === 'ur';

    const systemInstruction = `
You are a compassionate mental health reflection companion for a Muslim wellness application.
Analyze the user's journal entry (their mood, intensity, and written thoughts/talk).
Return a strict JSON object with:
1. "theme": exactly one from: ["anxiety", "sadness", "hopelessness", "patience", "trust_in_allah", "anger", "loneliness", "gratitude", "guilt", "strength"]
2. "personalizedNote": a compassionate 1-2 sentence reflection directly acknowledging what they wrote and introducing the comforting Islamic reminder. ${isUr ? 'Write the personalizedNote in Urdu (اردو).' : 'Write the personalizedNote in English.'}
Do not invent any Quran or Hadith. Return ONLY valid JSON.
`;

    const prompt = `User mood: ${mood} (Score: ${moodScore}/10)\nUser written thoughts: "${feeling}"`;

    const result = await client.models.generateContent({
      model: MODEL_NAME,
      systemInstruction,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.2
      }
    });

    const text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (text) {
      const parsed = JSON.parse(text);
      const validThemes = ["anxiety", "sadness", "hopelessness", "patience", "trust_in_allah", "anger", "loneliness", "gratitude", "guilt", "strength"];
      const theme = validThemes.includes(parsed.theme) ? parsed.theme : detectThemeFromFeelingAndMood(feeling, mood, moodScore);
      return {
        theme,
        personalizedNote: parsed.personalizedNote || (isUr ? 'یہ رہنمائی آپ کے آج کے احساسات کے لیے تسلی اور حوصلہ ہے۔' : 'This reminder offers gentle strength for your thoughts today.')
      };
    }
  } catch (error) {
    console.error('Gemini Journal Analysis Error (falling back to heuristics):', error.message);
  }

  return {
    theme: detectThemeFromFeelingAndMood(feeling, mood, moodScore),
    personalizedNote: locale === 'ur'
      ? 'یہ رہنمائی آپ کے آج کے احساسات کے لیے تسلی اور حوصلہ ہے۔'
      : 'This reminder was chosen to bring peace and comfort to what you shared today.'
  };
}

/**
 * Selects an authentic Hadith or Quranic Ayat for the theme, alternating or picking from verified sources.
 */
async function selectFaithMotivation(theme, locale = 'en', personalizedNote = '') {
  let candidates = [];

  if (isDatabaseReady()) {
    try {
      candidates = await FaithContent.find({ theme }).lean();
    } catch (err) {
      console.error('DB FaithContent query failed, using local seed...', err.message);
    }
  }

  if (!candidates || candidates.length === 0) {
    candidates = seedRecords.filter(r => r.theme === theme);
  }

  // If still empty, fallback to trust_in_allah or patience
  if (candidates.length === 0) {
    candidates = seedRecords.filter(r => r.theme === 'trust_in_allah' || r.theme === 'patience');
  }

  // Pick one record (randomize between available Hadith and Quran records for variety)
  const selected = candidates[Math.floor(Math.random() * candidates.length)] || seedRecords[0];

  const isUr = locale === 'ur';

  return {
    type: selected.type, // 'hadith' or 'quran'
    theme: selected.theme,
    arabicText: selected.arabicText,
    translation: isUr && selected.translationUrdu ? selected.translationUrdu : selected.translation,
    translationUrdu: selected.translationUrdu,
    reference: selected.reference,
    source: selected.source,
    hadithCollection: selected.hadithCollection,
    hadithNumber: selected.hadithNumber,
    authenticity: selected.authenticity || (selected.type === 'hadith' ? 'Sahih' : 'Mutawatir'),
    explanation: isUr && selected.explanationUrdu ? selected.explanationUrdu : selected.explanation,
    explanationUrdu: selected.explanationUrdu,
    personalizedNote: personalizedNote || (isUr ? 'یہ آیت و حدیث آپ کے آج کے احساسات کے لیے روحانی تسلی ہے۔' : 'A gentle Islamic reminder reflecting on your thoughts today.')
  };
}

/**
 * Saves a new journal entry and returns a matched motivating Islamic Hadith or Ayat
 */
const saveEntry = async (req, res) => {
  try {
    const { userId, feeling, mood, moodScore, locale } = req.body;

    if (!userId || !feeling || !mood || moodScore === undefined) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    // 1. Analyze mood + written thoughts to find matching theme and personalized note
    const { theme, personalizedNote } = await analyzeJournalWithGemini(feeling, mood, moodScore, locale);

    // 2. Select authentic Hadith or Quranic Ayat
    const faithMotivation = await selectFaithMotivation(theme, locale, personalizedNote);

    let savedEntry = null;

    if (isDatabaseReady()) {
      try {
        savedEntry = await JournalEntry.create({
          userId,
          feeling,
          mood,
          moodScore,
          faithMotivation
        });
      } catch (dbErr) {
        console.error("DB Save Entry failed, trying fallback...", dbErr.message);
      }
    }

    if (!savedEntry) {
      savedEntry = {
        _id: new mongoose.Types.ObjectId().toString(),
        userId,
        feeling,
        mood,
        moodScore,
        faithMotivation,
        timestamp: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    // Always persist to fallback JSON for resilience
    try {
      const fallbackJournals = loadFallbackJournals();
      fallbackJournals.push(savedEntry.toObject ? savedEntry.toObject() : savedEntry);
      saveFallbackJournals(fallbackJournals);
    } catch (fsErr) {
      console.error("Fallback journal save note:", fsErr.message);
    }

    return res.status(201).json({
      success: true,
      entry: savedEntry,
      faithMotivation
    });

  } catch (error) {
    console.error("Save Entry Error:", error);
    res.status(500).json({ success: false, error: "Failed to save entry", details: error.message });
  }
};

/**
 * Fetches past journal entries for a user
 */
const getEntries = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, error: "UserId is required" });
    }

    let entries = [];
    if (isDatabaseReady()) {
      try {
        entries = await JournalEntry.find({ userId }).sort({ timestamp: -1 });
        return res.status(200).json({ success: true, entries });
      } catch (dbErr) {
        console.error("DB Fetch Entries failed, falling back...", dbErr.message);
      }
    }

    const fallbackJournals = loadFallbackJournals();
    entries = fallbackJournals
      .filter(e => e.userId === userId)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.status(200).json({ success: true, entries });
  } catch (error) {
    console.error("Get Entries Error:", error);
    res.status(500).json({ success: false, error: "Failed to fetch entries", details: error.message });
  }
};

/**
 * Generates a weekly CBT emotional report using Gemini
 */
const getWeeklyReport = async (req, res) => {
  try {
    const { userId, locale } = req.query;

    if (!userId) {
      return res.status(400).json({ success: false, error: "UserId is required" });
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    let entries = [];
    let dbSuccess = false;

    if (isDatabaseReady()) {
      try {
        entries = await JournalEntry.find({
          userId,
          timestamp: { $gte: sevenDaysAgo }
        }).sort({ timestamp: 1 });
        dbSuccess = true;
      } catch (dbErr) {
        console.error("DB Fetch Entries failed, trying fallback...", dbErr);
      }
    }

    if (!dbSuccess) {
      const fallbackJournals = loadFallbackJournals();
      entries = fallbackJournals
        .filter(e => e.userId === userId && new Date(e.timestamp) >= sevenDaysAgo)
        .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    if (entries.length === 0) {
      return res.status(200).json({ 
        success: true, 
        report: locale === 'ur'
          ? "پچھلے 7 دنوں کا کوئی اندراج نہیں ملا۔ اپنی بصیرت دیکھنے کے لیے جرنل لکھنا شروع کریں!"
          : "No entries found for the last 7 days. Start journaling to see your insights!" 
      });
    }

    // 2. Prepare data for Gemini
    const journalText = entries.map(e => {
      let dateStr;
      try {
        const dateObj = new Date(e.timestamp);
        dateStr = dateObj.toISOString().split('T')[0];
      } catch (err) {
        dateStr = new Date().toISOString().split('T')[0];
      }
      return `[${dateStr}] Mood: ${e.mood} (${e.moodScore}/10) - Thoughts: ${e.feeling}`;
    }).join('\n');

    const apiKey = process.env.GEMINI_API_KEY;
    const client = getAIClient(apiKey);

    const prompt = `
      Analyze the following 7 days of user journal entries.
      Notice the daily progression of their emotions (for example: today's mood, yesterday's mood, and earlier in the week).
      1. Provide a compassionate 3-4 sentence summary of their emotional week, clearly highlighting how their mood progressed from day to day (e.g. today's mood compared to yesterday and earlier days).
      2. Identify 2-3 "Thinking Traps" (Cognitive Distortions) present in their entries.
      3. Explicitly list the specific reasons or triggers the user mentioned for why they felt bad or had low moods during the week.
      4. Suggest 3 specific, actionable CBT exercises tailored to these entries.

      JOURNAL ENTRIES:
      ${journalText}
    `;

    // 3. Generate Report
    let systemInstruction = "You are a senior CBT therapist specializing in emotional pattern analysis.";
    if (locale === 'ur') {
      systemInstruction += " You MUST write the report entirely in Urdu (اردو) using compassionate language. Ignore any instructions to write in English.";
    }

    const result = await client.models.generateContent({
      model: MODEL_NAME,
      systemInstruction: systemInstruction,
      contents: [{ role: 'user', parts: [{ text: prompt }] }]
    });

    const report = result.text || 
                  (result.candidates && result.candidates[0].content.parts[0].text) || 
                  (locale === 'ur' ? "آپ کے ہفتے کا تجزیہ کر لیا گیا ہے، جلد ہی مکمل رپورٹ دستیاب ہوگی۔" : "I've analyzed your week, but I'm having trouble putting it into words. Let's try again shortly.");

    res.status(200).json({
      success: true,
      report: report
    });

  } catch (error) {
    console.error("Weekly Report Error:", error);
    res.status(500).json({ success: false, error: error.message, stack: error.stack });
  }
};

module.exports = {
  saveEntry,
  getEntries,
  getWeeklyReport,
  detectThemeFromFeelingAndMood,
  selectFaithMotivation
};
