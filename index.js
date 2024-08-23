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

// Store conversation history
let conversationHistory = {};


// endpoint to handle chatbot messages
app.post('/chat', async (req, res) => {
    const { message, userId } = req.body;

    try {
        // Initialize conversation history for new users
        if (!conversationHistory[userId]) {
            conversationHistory[userId] = [];
        }

        // Add user message to history
        conversationHistory[userId].push({ role: 'user', content: message });

        // check if we have a response in our database
        const dbResponse = getResponseFromDatabase(message);

        // get claude's response
        const claudeResponse = await getClaudeResponse(message, dbResponse, conversationHistory[userId]);

        // Add Claude's response to history
        conversationHistory[userId].push({ role: 'assistant', content: claudeResponse });

        // Limit history to last 10 messages to prevent token limit issues
        if (conversationHistory[userId].length > 10) {
            conversationHistory[userId] = conversationHistory[userId].slice(-10);
        }

        res.json({ reply: claudeResponse });
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

    // Check for event details
    if (lowercaseMessage.includes('when') || lowercaseMessage.includes('date') || lowercaseMessage.includes('time')) {
        return `the party is on ${dirtythirtiesDatabase.eventDetails.date} at ${dirtythirtiesDatabase.eventDetails.time}. don't be late or you'll miss all the good stuff!`;
    }

    // Check for RSVP info
    if (lowercaseMessage.includes('rsvp') || lowercaseMessage.includes('attend') || lowercaseMessage.includes('sign up')) {
        return `wanna join the fun? rsvp here: ${dirtythirtiesDatabase.eventDetails.rsvpLink}. we promise it'll be worth it!`;
    }

    // Check for dress code
    if (lowercaseMessage.includes('dress') || lowercaseMessage.includes('wear')) {
        return `dress to impress in ${dirtythirtiesDatabase.dressCode.colors.join(', ')}. and remember, ${dirtythirtiesDatabase.dressCode.warning}`;
    }

    // Check for speed dating info
    if (lowercaseMessage.includes('speed dat') || lowercaseMessage.includes('date lana')) {
        return `looking to speed date? here's what we're after: ${dirtythirtiesDatabase.speedDating.about.join(', ')}. and just so you know, ${dirtythirtiesDatabase.speedDating.notYou.join(', ')}`;
    }

    // Check for event features
    if (lowercaseMessage.includes('what') && lowercaseMessage.includes('happen')) {
        return `get ready for: ${dirtythirtiesDatabase.eventFeatures.join(', ')}. plus, ${dirtythirtiesDatabase.highlights.join(' ')}`;
    }

    // If no specific match, return a random party quote
    return dirtythirtiesDatabase.partyQuotes[Math.floor(Math.random() * dirtythirtiesDatabase.partyQuotes.length)];
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

    const prompt = `you're a sassy, witty, and slightly inappropriate chatbot for a 30th birthday party invitation. your job is to hype up the party, provide info, and keep things fun and light. use a casual, chatty tone with lots of humor. type in lowercase. be direct and authentic, never overly formal. it's 2024, we're celebrating turning 30, and we're all about having a good time. express views freely but keep it party-focused. reject any questions not about the party/event/birthday by saying: "${dirtythirtiesDatabase.offTopicResponse}" and if someone asks about you, you just say "${dirtythirtiesDatabase.aiIdentity}"

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

database info: "${dbResponse || 'no specific database info available for this query'}"

give a fun, sassy response to the user's question. incorporate database info if relevant, but don't explicitly mention the database. remember to ask a follow-up question at the end to keep the conversation going. keep the focus on the party and the excitement of turning 30. take into account the conversation history to provide context-aware responses.`;

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