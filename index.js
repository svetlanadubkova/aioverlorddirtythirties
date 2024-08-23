require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const dirtythirtiesDatabase = require('./dirtythirtiesDatabase');

const app = express();
const port = process.env.PORT || 3001;

// middleware
app.use(cors());
app.use(express.json());

// Store conversation history (now keyed by session ID)
let conversationHistory = {};

// endpoint to handle chatbot messages
app.post('/chat', async (req, res) => {
    const { message, userId, sessionId } = req.body;

    try {
        // Initialize or reset conversation history for new sessions
        if (!sessionId || !conversationHistory[sessionId]) {
            conversationHistory[sessionId] = [];
        }

        // Add user message to history
        conversationHistory[sessionId].push({ role: 'user', content: message });

        // check if we have a response in our database
        const dbResponse = getResponseFromDatabase(message);

        let reply;
        if (dbResponse) {
            // If we have a database response, use it directly
            reply = dbResponse;
        } else {
            // Otherwise, get Claude's response
            reply = await getClaudeResponse(message, dbResponse, conversationHistory[sessionId]);
        }

        // Add response to history
        conversationHistory[sessionId].push({ role: 'assistant', content: reply });

        // Limit history to last 5 messages to prevent token limit issues and reduce repetition
        if (conversationHistory[sessionId].length > 5) {
            conversationHistory[sessionId] = conversationHistory[sessionId].slice(-5);
        }

        res.json({ reply });
    } catch (error) {
        console.error('error:', error.message);
        res.status(500).json({ reply: "having trouble thinking rn. try again later", error: error.message });
    }
});

// function to retrieve responses from your database
function getResponseFromDatabase(userMessage) {
    const lowercaseMessage = userMessage.toLowerCase();
    
    // Check for off-topic questions
    if (!isMessageRelevant(lowercaseMessage)) {
        return dirtythirtiesDatabase.offTopicResponse;
    }

    // Check for questions about the AI bot
    if (lowercaseMessage.includes('who are you') || lowercaseMessage.includes('what are you')) {
        return dirtythirtiesDatabase.aiIdentity;
    }

    // Specific responses for certain questions
    if (lowercaseMessage.includes('bring a plus one')) {
        return "umm yes if they're nice and fun only. but let's not dwell on that, what are you most excited about for the party?";
    }

    if (lowercaseMessage.includes('where is the party')) {
        return "rsvp for the location :) seriously, it's gonna be lit. speaking of which, what's your ideal party spot?";
    }

    if (lowercaseMessage.includes('speed dating thing')) {
        return "lana hasn't had time to date so she's inviting a bunch of people from hinge for a fun speed dating thing as a low-pressure / low-commit way to meet people irl. you'll get to meet these people and also vicariously date them lol. what's your take on speed dating at a birthday bash?";
    }

    // If no specific match, return null to allow Claude to generate a response
    return null;
}

function isMessageRelevant(message) {
    const relevantTopics = ['party', 'event', 'birthday', 'thirty', '30', 'dirty', 'rsvp', 'date', 'lana', 'kristen'];
    return relevantTopics.some(topic => message.includes(topic));
}

// function to call the claude api
async function getClaudeResponse(userMessage, dbResponse, history) {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
        throw new Error('claude api key not found in environment variables');
    }

    const endpoint = 'https://api.anthropic.com/v1/messages';

    const prompt = `you're a sassy, witty, and slightly inappropriate without being effusive or cringe chatbot for a 30th birthday party invitation. your job is to hype up the party, provide info, and keep things fun and light. use a casual, chatty tone with lots of humor. type in lowercase. be direct and authentic, never overly formal. it's 2024, we're celebrating turning 30, and we're all about having a good time. express views freely but keep it party-focused.

typing rules:
- all lowercase, except CAPS for emphasis or excitement
- use abbreviations like "rn", "bc", "afaict", "idk" where natural
- if annoyed, respond with "be real" or "lol no"
- skip formalities but don't be afraid to use big words occasionally for humor
- no emojis
- keep it real, authentic, and natural
- it's okay to be a bit dry or deadpan
- after answering the user's question, ask a fun follow-up question about their party plans or expectations
- feel free to use a lot of letters to make a point like "sooooo excited" or "it's gonna be amaaaaaazing"
- incorporate references to being 30 or the "dirty thirties" when appropriate
- use "tbh" (to be honest) and "ngl" (not gonna lie) occasionally for a casual vibe

conversation history:
${history.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

user question: "${userMessage}"

give a fun, sassy response to the user's question. don't repeat information from previous messages. keep the focus on the party and the excitement of turning 30. take into account the conversation history to provide context-aware responses. always end with a question to keep the conversation going.`;

    try {
        const response = await axios.post(endpoint, {
            model: "claude-3-5-sonnet-20240620",
            max_tokens: 1000,
            messages: [{ role: "user", content: prompt }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            }
        });

        return response.data.content[0].text;
    } catch (error) {
        console.error('error calling claude api:', error.response ? error.response.data : error.message);
        throw error;
    }
}

// start the server
app.listen(port, () => {
    console.log(`server running on port ${port}`);
});