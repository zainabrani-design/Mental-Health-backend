require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function test() {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const client = new GoogleGenAI({ apiKey });
        
        console.log("Testing gemini-2.5-flash...");
        const result = await client.models.generateContent({
            model: 'models/gemini-2.5-flash',
            systemInstruction: "You are a pirate.",
            contents: "Say hello",
            config: {
                temperature: 0.7
            }
        });
        console.log("Success:", result.text);
    } catch (e) {
        console.error("Error:", e);
    }
}

test();
