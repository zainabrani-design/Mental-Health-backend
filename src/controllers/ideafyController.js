const mongoose = require('mongoose');
const { getAIClient, MODEL_NAME } = require('../config/aiConfig');
const { Type } = require('@google/genai');
const { ALLOWED_THEMES, FAITH_THEME_MAP, IDEAFY_SYSTEM_PROMPT } = require('../config/ideafyConfig');
const FaithContent = require('../models/FaithContent');
const seedRecords = require('../data/faithContentSeed.json');

const cleanJson = (text) => {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = normalized.indexOf('{');
  const end = normalized.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new SyntaxError('Gemini did not return a JSON object');
  }
  return normalized.slice(start, end + 1);
};

const normalizeTheme = (value) => {
  const theme = String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (ALLOWED_THEMES.includes(theme)) return theme;
  const compoundThemes = [
    ['hopelessness', 'hopelessness'],
    ['anxiety', 'anxiety'],
    ['self_worth', 'self_worth'],
    ['trust_in_allah', 'trust_in_allah']
  ];
  return compoundThemes.find(([fragment]) => theme.includes(fragment))?.[1] || null;
};

const normalizeAnalysis = (analysis) => {
  const theme = normalizeTheme(analysis.theme);
  const severityValue = String(analysis.severity || '').toLowerCase();
  const riskValue = String(analysis.riskLevel || '').toLowerCase();
  const severity = ['low', 'moderate', 'high'].includes(severityValue) ? severityValue : 'moderate';
  const riskLevel = ['low', 'moderate', 'high'].includes(riskValue) ? riskValue : severity;

  if (!theme || !analysis.summary || !analysis.activity || !analysis.goal) {
    throw new Error('Gemini returned an incomplete Ideafy analysis');
  }

  return {
    theme,
    emotion: String(analysis.emotion || 'mixed emotions'),
    thoughtPattern: String(analysis.thoughtPattern || 'unhelpful thought pattern'),
    severity,
    riskLevel,
    summary: String(analysis.summary),
    activity: {
      title: String(analysis.activity.title || 'Thought reflection'),
      description: String(analysis.activity.description || 'Write down the thought and one balanced alternative.')
    },
    goal: String(analysis.goal),
    safetyMessage: riskLevel === 'high'
      ? String(analysis.safetyMessage || 'You deserve immediate support. Please contact someone you trust, seek professional help, and contact local emergency or crisis services if you may be in immediate danger.')
      : ''
  };
};

const formatFaithReminder = (item, locale = 'en') => {
  if (!item) return null;
  const isUr = locale === 'ur';
  return {
    type: item.type,
    theme: item.theme,
    arabicText: item.arabicText,
    translation: isUr && item.translationUrdu ? item.translationUrdu : item.translation,
    translationUrdu: item.translationUrdu,
    reference: item.reference,
    source: item.source,
    hadithCollection: item.hadithCollection,
    hadithNumber: item.hadithNumber,
    authenticity: item.authenticity || (item.type === 'hadith' ? 'Sahih' : 'Mutawatir'),
    explanation: isUr && item.explanationUrdu ? item.explanationUrdu : item.explanation,
    explanationUrdu: item.explanationUrdu
  };
};

const selectFaithContent = async (theme, locale = 'en') => {
  const contentTheme = FAITH_THEME_MAP[theme] || 'trust_in_allah';
  let candidates = [];

  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      candidates = await FaithContent.find({ theme: contentTheme }).lean();
    }
  } catch (error) {
    console.error('Faith content DB lookup failed, using local seed fallback:', error.message);
  }

  if (!candidates || candidates.length === 0) {
    candidates = seedRecords.filter(r => r.theme === contentTheme);
  }

  if (!candidates || candidates.length === 0) {
    candidates = seedRecords.filter(r => r.theme === 'trust_in_allah' || r.theme === 'patience');
  }

  const quranItem = candidates.find(c => c.type === 'quran') || seedRecords.find(c => c.type === 'quran');
  const hadithItem = candidates.find(c => c.type === 'hadith') || seedRecords.find(c => c.type === 'hadith');

  const formattedQuran = formatFaithReminder(quranItem, locale);
  const formattedHadith = formatFaithReminder(hadithItem, locale);

  const reminders = [];
  if (formattedQuran) reminders.push(formattedQuran);
  if (formattedHadith) reminders.push(formattedHadith);

  return {
    primary: reminders[0] || null,
    quran: formattedQuran,
    hadith: formattedHadith,
    all: reminders
  };
};

const analyzeIdeafy = async (answers, client = getAIClient(process.env.GEMINI_API_KEY)) => {
  const contents = [{
    role: 'user',
    parts: [{ text: JSON.stringify({ answers }) }]
  }];

  const result = await client.models.generateContent({
    model: MODEL_NAME,
    systemInstruction: IDEAFY_SYSTEM_PROMPT,
    contents,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          theme: { type: Type.STRING, enum: ALLOWED_THEMES },
          emotion: { type: Type.STRING },
          thoughtPattern: { type: Type.STRING },
          severity: { type: Type.STRING },
          riskLevel: { type: Type.STRING },
          summary: { type: Type.STRING },
          activity: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING }
            },
            required: ['title', 'description']
          },
          goal: { type: Type.STRING },
          safetyMessage: { type: Type.STRING }
        },
        required: ['theme', 'emotion', 'thoughtPattern', 'severity', 'riskLevel', 'summary', 'activity', 'goal', 'safetyMessage']
      },
      maxOutputTokens: 3000,
      temperature: 0.2
    }
  });

  const text = result.text || result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    console.error('Ideafy Gemini response contained no text');
    throw new Error('Gemini returned an empty Ideafy analysis');
  }
  return normalizeAnalysis(JSON.parse(cleanJson(text)));
};

const processIdeafy = async (req, res) => {
  try {
    const { answers, locale = 'en' } = req.body;
    if (!Array.isArray(answers) || answers.length !== 5 || answers.some(answer => typeof answer !== 'string')) {
      return res.status(400).json({ success: false, error: 'Ideafy requires five written answers' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ success: false, error: 'AI service is not configured' });
    }

    const analysis = await analyzeIdeafy(answers);
    let faithData = { primary: null, quran: null, hadith: null, all: [] };
    try {
      faithData = await selectFaithContent(analysis.theme, locale);
    } catch (error) {
      console.error('Faith content lookup failed:', error.message);
    }

    res.status(200).json({
      success: true,
      theme: analysis.theme,
      emotion: analysis.emotion,
      thoughtPattern: analysis.thoughtPattern,
      severity: analysis.severity,
      riskLevel: analysis.riskLevel,
      analysis: {
        summary: analysis.summary,
        activity: analysis.activity,
        goal: analysis.goal
      },
      safetyMessage: analysis.safetyMessage,
      faithReminder: faithData.primary,
      faithReminders: faithData.all,
      quranReminder: faithData.quran,
      hadithReminder: faithData.hadith
    });
  } catch (error) {
    console.error('Ideafy Controller Error:', error.message);
    const isInvalidJson = error instanceof SyntaxError || error.message.includes('incomplete Ideafy');
    res.status(isInvalidJson ? 502 : 503).json({
      success: false,
      error: isInvalidJson ? 'The AI returned an invalid reflection. Please try again.' : 'The AI service is temporarily unavailable. Please try again.'
    });
  }
};

module.exports = { processIdeafy, normalizeAnalysis, selectFaithContent, analyzeIdeafy };