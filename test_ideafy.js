const assert = require('node:assert/strict');
const test = require('node:test');
const { analyzeIdeafy, selectFaithContent } = require('./src/controllers/ideafyController');

const fakeClient = (analysis) => ({
  models: {
    generateContent: async () => ({ text: JSON.stringify(analysis) })
  }
});

const baseAnalysis = (theme, overrides = {}) => ({
  theme,
  emotion: 'sadness',
  thoughtPattern: 'negative_future_prediction',
  severity: 'moderate',
  riskLevel: 'low',
  summary: 'A compassionate reflection.',
  activity: { title: 'Thought reframing', description: 'Write one balanced thought.' },
  goal: 'Write down one thing you can control today.',
  safetyMessage: '',
  ...overrides
});

test('accepts the requested emotional themes', async () => {
  for (const theme of ['hopelessness', 'anxiety', 'failure', 'grief', 'stress']) {
    const result = await analyzeIdeafy(['answer 1', 'answer 2', 'answer 3', 'answer 4', 'answer 5'], fakeClient(baseAnalysis(theme)));
    assert.equal(result.theme, theme);
    assert.ok(result.activity.title);
    assert.ok(result.goal);
  }
});

test('keeps a hopeful response on an appropriate hope theme', async () => {
  const result = await analyzeIdeafy(['feeling better', 'hopeful', 'calmer', 'supported', 'ready'], fakeClient(baseAnalysis('hope')));
  assert.equal(result.theme, 'hope');
  assert.equal(result.riskLevel, 'low');
});

test('preserves high-risk safety guidance in the structured result', async () => {
  const result = await analyzeIdeafy(
    ['I may hurt myself', 'I feel unsafe', 'I have a plan', 'I feel alone', 'I need help'],
    fakeClient(baseAnalysis('hopelessness', {
      severity: 'high',
      riskLevel: 'high',
      safetyMessage: 'Contact a trusted person and local emergency services now.'
    }))
  );
  assert.equal(result.riskLevel, 'high');
  assert.match(result.safetyMessage, /trusted person/);
});

test('rejects a theme outside the controlled list', async () => {
  await assert.rejects(
    analyzeIdeafy(['a', 'b', 'c', 'd', 'e'], fakeClient(baseAnalysis('invented_theme'))),
    /incomplete Ideafy analysis/
  );
});

test('selectFaithContent returns both Quranic Ayat and Prophetic Hadith for all allowed themes', async () => {
  const { ALLOWED_THEMES } = require('./src/config/ideafyConfig');
  for (const theme of ALLOWED_THEMES) {
    const faithData = await selectFaithContent(theme, 'en');
    assert.ok(faithData.primary, `Primary reminder missing for theme: ${theme}`);
    assert.ok(faithData.quran, `Quran reminder missing for theme: ${theme}`);
    assert.ok(faithData.hadith, `Hadith reminder missing for theme: ${theme}`);
    assert.equal(faithData.quran.type, 'quran');
    assert.equal(faithData.hadith.type, 'hadith');
    assert.ok(faithData.quran.arabicText, `Quran Arabic text missing for theme: ${theme}`);
    assert.ok(faithData.hadith.arabicText, `Hadith Arabic text missing for theme: ${theme}`);
    assert.ok(faithData.all.length >= 2, `All reminders count should be >= 2 for theme: ${theme}`);
  }
});

test('selectFaithContent supports Urdu translations', async () => {
  const faithDataUrdu = await selectFaithContent('anxiety', 'ur');
  assert.ok(faithDataUrdu.quran.translation, 'Urdu Quran translation missing');
  assert.match(faithDataUrdu.quran.translation, /اللہ/);
  assert.ok(faithDataUrdu.hadith.translation, 'Urdu Hadith translation missing');
  assert.match(faithDataUrdu.hadith.translation, /اللہ/);
});