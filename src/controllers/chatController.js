const { getAIClient, CBT_SYSTEM_PROMPT, MODEL_NAME } = require('../config/aiConfig');
const JournalSession = require('../models/JournalSession');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const processChat = async (req, res) => {
    try {
        const { userId, message, history, mood, moodEmoji, locale } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({
                error: "Internal Server Error",
                details: "API Key not configured on server"
            });
        }

        const client = getAIClient(apiKey);

        // If this is the start of a new chat, fetch the last JournalSession for the previous goal
        let sessionGoalText = "";
        if ((!history || history.length === 0) && userId) {
            try {
                const lastSession = await JournalSession.findOne({ userId }).sort({ timestamp: -1 });
                if (lastSession && lastSession.todayGoal) {
                    sessionGoalText = `\n\n[SYSTEM NOTE: The user's previous goal was: "${lastSession.todayGoal}". Start the conversation by asking how it went according to STEP 1 of your instructions.]`;
                }
            } catch (dbErr) {
                console.error("Failed to fetch previous session goal:", dbErr);
            }
        }

        // Prepare the conversation contents
        const contents = [
            ...(history || []),
            { role: 'user', parts: [{ text: message + sessionGoalText }] }
        ];

        let systemPrompt = CBT_SYSTEM_PROMPT;

        if (mood && moodEmoji) {
            systemPrompt += `\n\n[SYSTEM NOTE: The user reported feeling ${moodEmoji} ${mood} today. Keep this in mind when exploring their feelings.]`;
        }

        if (locale === 'ur') {
            systemPrompt += `\n\n[SYSTEM NOTE: The user's interface language is Urdu. You MUST conduct the session and respond entirely in Urdu (اردو) using compassionate language. Ignore any instructions to respond in English, but keep output JSON structures exactly in English as specified in Step 9.]`;
        }

        // Execute with retry logic (3 attempts with exponential backoff)
        const result = await (async () => {
            let lastError;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    return await client.models.generateContent({
                        model: MODEL_NAME,
                        systemInstruction: systemPrompt,
                        contents: contents,
                        config: {
                            maxOutputTokens: 1000, // Increased for potential JSON output
                            temperature: 0.7,
                        }
                    });
                } catch (error) {
                    lastError = error;
                    const status = error.status || error.statusCode || (error.response && error.response.status) || (error.error && error.error.code);
                    const statusStr = (error.status || (error.error && error.error.status) || "").toString().toUpperCase();
                    
                    console.error(`❌ AI Attempt ${attempt} failed:`, error.message);

                    // Retry only on specific temporary errors
                    if (status == 503 || status == 429 || statusStr === 'UNAVAILABLE' || statusStr === 'RESOURCE_EXHAUSTED') {
                        if (attempt === 3) break;
                        const delay = Math.pow(2, attempt) * 1000;
                        console.warn(`⚠️ AI Service busy/limited (Status ${status || statusStr}). Retrying in ${delay/1000}s...`);
                        await sleep(delay);
                        continue;
                    }
                    throw error; // Immediate fail for other errors (e.g. 400, 401)
                }
            }
            throw lastError;
        })();

        let reply = result.text || 
                     (result.candidates && result.candidates[0].content.parts[0].text) || 
                     "I'm sorry, I couldn't generate a response. Please try again.";

        // Post-process the reply to check for the JSON block (Step 9)
        const jsonMatch = reply.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        let extractedData = null;
        let cleanReply = reply;

        if (jsonMatch) {
            try {
                extractedData = JSON.parse(jsonMatch[1]);
                cleanReply = reply.replace(/```json\s*\{[\s\S]*?\}\s*```/, '').trim();
                
                // Save to database
                if (userId) {
                     await JournalSession.create({
                         userId,
                         ...extractedData
                     });
                     console.log("✅ Successfully saved new JournalSession for user:", userId);
                }
            } catch (e) {
                console.error("Failed to parse JSON from AI or save to DB:", e);
            }
        }

        res.status(200).json({
            success: true,
            reply: cleanReply,
            sessionSaved: !!extractedData,
            extractedData: extractedData // Optional: send back to frontend if needed
        });
    } catch (error) {
        console.error("AI Controller Error:", error);
        
        const status = error.status || error.statusCode || (error.response && error.response.status) || (error.error && error.error.code);
        const isUnavailable = status == 503 || status === 'UNAVAILABLE' || (error.error && error.error.status === 'UNAVAILABLE');
        
        res.status(isUnavailable ? 503 : 500).json({
            success: false,
            error: isUnavailable ? "Service Busy" : "Failed to process AI request",
            details: isUnavailable 
                ? "Our digital sanctuary is currently very crowded. Please take a deep breath and try again in a few moments."
                : error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

module.exports = {
    processChat
};
