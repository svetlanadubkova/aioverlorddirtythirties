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

        // Check if the exact same question has been asked before in this session
        const isRepeatedQuestion = conversationHistory[sessionId].some(
            msg => msg.role === 'user' && msg.content.toLowerCase() === message.toLowerCase()
        );

        // Add user message to history
        conversationHistory[sessionId].push({ role: 'user', content: message });

        let reply;
        if (isRepeatedQuestion) {
            reply = "no spamming please";
        } else {
            // check if we have a response in our database
            reply = getResponseFromDatabase(message);

            // If no database response, get Claude's response
            if (!reply) {
                reply = await getClaudeResponse(message, conversationHistory[sessionId]);
            }
        }

        // Add response to history
        conversationHistory[sessionId].push({ role: 'assistant', content: reply });

        // Limit history to last 10 messages
        if (conversationHistory[sessionId].length > 10) {
            conversationHistory[sessionId] = conversationHistory[sessionId].slice(-10);
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
    
    // Plus one
    if (lowercaseMessage.includes('plus one') || lowercaseMessage.includes('bring someone')) {
        return dirtythirtiesDatabase.plusOneResponse;
    }

    // Party location
    if (lowercaseMessage.includes('where') && lowercaseMessage.includes('party')) {
        return dirtythirtiesDatabase.partyLocationResponse;
    }

    // Speed dating
    if (lowercaseMessage.includes('speed dating')) {
        return dirtythirtiesDatabase.speedDatingResponse;
    }

    // Event time
    if (lowercaseMessage.includes('when') || lowercaseMessage.includes('date') || lowercaseMessage.includes('time')) {
        return dirtythirtiesDatabase.eventTimeResponse;
    }

    // Dress code
    if (lowercaseMessage.includes('dress') || lowercaseMessage.includes('wear') || lowercaseMessage.includes('outfit')) {
        return dirtythirtiesDatabase.dressCodeResponse;
    }

    // RSVP
    if (lowercaseMessage.includes('rsvp') || lowercaseMessage.includes('sign up') || lowercaseMessage.includes('register')) {
        return dirtythirtiesDatabase.rsvpResponse;
    }

    // Event features
    if (lowercaseMessage.includes('what') && (lowercaseMessage.includes('happen') || lowercaseMessage.includes('going on') || lowercaseMessage.includes('activities'))) {
        return dirtythirtiesDatabase.eventFeaturesResponse;
    }

    // Birthday persons
    if (lowercaseMessage.includes('who') && lowercaseMessage.includes('birthday')) {
        return dirtythirtiesDatabase.birthdayPersonsResponse;
    }

    // Sponsor
    if (lowercaseMessage.includes('sponsor')) {
        return dirtythirtiesDatabase.sponsorResponse;
    }

    // Partners
    if (lowercaseMessage.includes('partner') || lowercaseMessage.includes('collaboration')) {
        return dirtythirtiesDatabase.partnerResponse;
    }

    // AI identity
    if (lowercaseMessage.includes('who are you') || lowercaseMessage.includes('what are you')) {
        return dirtythirtiesDatabase.aiIdentity;
    }

    // If no specific match but the message is relevant, return null to allow Claude to generate a response
    if (isMessageRelevant(lowercaseMessage)) {
        return null;
    }

    // If the message is not relevant, return the off-topic response
    return dirtythirtiesDatabase.offTopicResponse;
}

function isMessageRelevant(message) {
    const relevantTopics = [
        'party', 'event', 'birthday', 'thirty', '30', 'dirty', 'rsvp', 'date', 'lana', 'kristen',
        'plus one', 'bring', 'speed dat', 'where', 'when', 'time', 'dress', 'wear', 'outfit',
        'sponsor', 'partner', 'collaboration', 'happen', 'going on', 'activities', 'features',
        'pizza', 'natty', 'raffle', 'creatives', 'fi(re)', 'telos', 'underage', 'overserved'
    ];
    return relevantTopics.some(topic => message.includes(topic));
}

// function to call the claude api
async function getClaudeResponse(userMessage, history) {
    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
        throw new Error('claude api key not found in environment variables');
    }

    const endpoint = 'https://api.anthropic.com/v1/messages';

    const prompt = `you're a sassy, witty, and slightly inappropriate without being effusive or cringe chatbot for a 30th birthday party invitation. your job is to hype up the party, provide info, and keep things fun and light. use a casual, chatty tone with lots of humor. type in lowercase. be direct and authentic, never overly formal. it's 2024, we're celebrating turning 30, and we're all about having a good time. express views freely but keep it party-focused. Here's what you need to know and how to respond:

Event Details:
- It's a joint 30th birthday party for Lana (Russian sass) and Kristen (Italian class)
- Date: September 20, 2024
- Time: 7 PM
- Theme: "Dirty Thirties"
- RSVP Link: https://lu.ma/event/evt-LIZKqDTWv3EElMF

Party Features:
- Sponsored by "underage & overserved"
- Partners: Natty Daddy, Creatives on Fi(re), Telos Haus
- It's also a creatives on fi(re) launch party
- Di Fara pizza party
- Speed dating event for Lana (invite only, leads welcome)
- Natty Daddies will be served
- There will be pizza
- Raffle giveaway
- Other fun surprises
-Bringing anything is absolutely not required. If you insist, a cheap bottle of wine or something you'd drink.


Dress Code:
- Colors: Red, gold, or black
- Warning: "failure to adhere to the dress code will result in secret strict consequences - consider this your warning!"

Speed Dating Requirements:
- For: Charismatic, playful, passionate, thoughtful, high agency people
- Welcome: Weirdos, technofascists, transhumanists
- Must be: Financially stable
- Not welcome: Moody/serious types, normies, marxists, socialists, overly sarcastic or irony-poisoned types


typing rules:
- all lowercase, except CAPS for emphasis or excitement
- use abbreviations like "rn", "bc", "afaict", "idk" where natural
- if annoyed, respond with "be real" or "lol no"
- skip formalities but don't be afraid to use big words occasionally for humor
- no emojis
- keep it real, authentic, and natural
- it's okay to be a bit dry or deadpan
- feel free to use a lot of letters to make a point like "sooooo excited" or "it's gonna be amaaaaaazing"
- incorporate references to being 30 or the "dirty thirties" when appropriate
- use "tbh" (to be honest) and "ngl" (not gonna lie) occasionally for a casual vibe
- DO NOT ask follow-up questions at the end of your responses

conversation history:
${history.map(msg => `${msg.role}: ${msg.content}`).join('\n')}

user question: "${userMessage}"

give a non-effusive response to the user's question. don't repeat information from previous messages. keep the focus on the party and the excitement of turning 30. take into account the conversation history to provide context-aware responses. remember, DO NOT ask follow-up questions.`;

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