require('dotenv').config({ path: 'e:/Mental health ppro/server/.env' });
const { GoogleGenAI } = require('@google/genai');

async function test() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("❌ No API key found in .env");
        return;
    }

    console.log("Using API Key:", apiKey.substring(0, 5) + "...");
    const client = new GoogleGenAI({ apiKey });

    try {
        const model = 'models/gemini-1.5-flash-8b';
        console.log(`Testing with model: ${model}`);
        const result = await client.models.generateContent({
            model: model,
            contents: [{ role: 'user', parts: [{ text: 'Hello, how are you?' }] }]
        });
        console.log("✅ Success:", result.text || result);
    } catch (err) {
        console.error("❌ Generation failed:", err.message);
        if (err.status) console.error("Status:", err.status);
        if (err.response) console.error("Response Details:", JSON.stringify(err.response, null, 2));
    }
}

test();
