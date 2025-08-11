// src/handlers/nepq.handler.js (English Version)

const config = require('../config');
const { OpenAI } = require('openai');
const { buildPromptForClinic } = require('../services/promptBuilder');
const calendarService = require('../services/calendar.service');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// --- HELPER FUNCTIONS FOR DATE/TIME ---
function convertToISO(dateString) {
    console.warn(`[Helper] Date/time conversion needs to be implemented. Using current date as fallback.`);
    return new Date().toISOString();
}

function calculateEndTime(startDateTime, durationMinutes = 50) {
    const startDate = new Date(startDateTime);
    const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
    return endDate.toISOString();
}

/**
 * Main function that communicates with the LLM and now also with Google Calendar.
 * @param {object} session - The complete user session object.
 * @param {string} latestMessage - The latest message sent by the user.
 * @returns {Promise<object>} An object containing the AI's reply and the new conversation state.
 */
async function getLlmReply(session, latestMessage) {
    try {
        const systemPrompt = buildPromptForClinic(session.clinicConfig, session);

        const messages = [
            { role: 'system', content: systemPrompt },
            ...session.conversationHistory,
            { role: 'user', content: latestMessage }
        ];

        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // Recommended model
            messages,
            temperature: 0.7,
            max_tokens: 600,
        });

        const botReply = response.choices[0].message.content;

        session.conversationHistory.push({ role: 'user', content: latestMessage });
        session.conversationHistory.push({ role: 'assistant', content: botReply });
        
        if (session.conversationHistory.length > 12) {
            session.conversationHistory = session.conversationHistory.slice(-12);
        }

        // Check for closing statement in English
        const isClosingStatement = 
            botReply.includes("That's why the service is private") ||
            botReply.includes("The investment for the first consultation is");

        if (isClosingStatement && session.state === 'nepq_discovery') {
            console.log(`[FSM] Closing statement detected. Changing state to 'closing_delivered'.`);
            return { reply: botReply, newState: 'closing_delivered' };
        }
        
        // --- GOOGLE CALENDAR INTEGRATION ---
        // Check for booking confirmation in English
        const isBookingConfirmed = botReply.toLowerCase().includes("appointment confirmed") || botReply.toLowerCase().includes("successfully scheduled");

        if (isBookingConfirmed) {
            console.log(`[FSM] Booking confirmed by AI. Creating event in Google Calendar...`);
            const clinicCalendarId = session.clinicConfig?.google_calendar_id;

            if (clinicCalendarId) {
                const appointmentString = "July 15, 2025, 10:00"; // Example
                const startDateTime = convertToISO(appointmentString);
                const endDateTime = calculateEndTime(startDateTime);

                await calendarService.createEvent(clinicCalendarId, {
                    summary: `Consultation - ${session.firstName}`,
                    description: `Booking via virtual assistant for ${session.firstName}.\nPhone: ${session.from}`,
                    startDateTime,
                    endDateTime,
                });
            } else {
                console.warn(`⚠️ Clinic ${session.clinicConfig.doctorName} does not have a Google Calendar configured.`);
            }

            return { reply: botReply, newState: 'booked' };
        }
        // --- END OF GOOGLE CALENDAR INTEGRATION ---

        return { reply: botReply, newState: session.state };

    } catch (error) {
        console.error('🚨 Error in OpenAI API call:', error);
        return { 
            reply: `Sorry, ${session.firstName || 'friend'}, I am experiencing a technical difficulty.`,
            newState: session.state 
        };
    }
}


/**
 * ADVANCED FINAL VERSION: Manages onboarding using AI to extract the name.
 */
async function handleInitialMessage(session, message, clinicConfig) {
    const currentState = session.onboardingState;
    const doctorName = clinicConfig.doctorName || 'our specialist';
    const secretaryName = clinicConfig.secretaryName || 'the virtual assistant';

    if (currentState === 'start') {
        session.onboardingState = 'awaiting_name';
        return `Hello! Welcome to Dr. ${doctorName}'s office. I am ${secretaryName}, the virtual assistant. What is your name, please?`;
    }

    if (currentState === 'awaiting_name') {
        console.log(`[AI Onboarding] Attempting to extract name from sentence: "${message}"`);
        
        const nameExtractionPrompt = `
        Your task is to analyze a user's sentence introducing themselves to a secretary named 'Ana' and extract the user's first name.
        Follow this reasoning process:
        1. Analyze the sentence: "${message}".
        2. Identify all people's names in the sentence.
        3. Determine which name belongs to the USER who is speaking, ignoring the secretary's name ('Ana').
        4. If a user's name is found, put it in the 'extracted_name' field.
        5. If no user name is found, or if it's just a greeting, the value of 'extracted_name' must be null.
        Respond ONLY with a valid JSON object, following this format:
        { "reasoning": "Your step-by-step reasoning here.", "extracted_name": "UserFirstName" }
        `;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // Recommended model
            messages: [{ role: 'system', content: nameExtractionPrompt }],
            response_format: { type: "json_object" } 
        });

        const responseContent = response.choices[0].message.content;
        console.log('[AI Onboarding] JSON response from AI:', responseContent);

        try {
            const result = JSON.parse(responseContent);
            const potentialName = result.extracted_name;

            if (!potentialName || potentialName.length < 2) {
                return `Sorry, I could not identify your name. Could you please tell me just what I should call you?`;
            }

            const formattedName = potentialName.split(" ")[0].charAt(0).toUpperCase() + potentialName.split(" ")[0].slice(1).toLowerCase();
            session.firstName = formattedName;
            session.onboardingState = 'complete';
            session.state = 'nepq_discovery';

            const welcomeMessage = `Perfect, ${formattedName}! It's a pleasure to speak with you. To best assist you, could you tell me what brought you to see Dr. ${doctorName} today?`;
            session.conversationHistory = [
                { role: 'user', content: `The patient introduced themselves as ${formattedName}.` },
                { role: 'assistant', content: welcomeMessage }
            ];
            
            return welcomeMessage;
        } catch (e) {
            console.error("Error processing JSON from AI:", e);
            return `Sorry, I'm having a technical difficulty understanding your response. Could you please repeat your name?`;
        }
    }

    return null;
}

module.exports = { getLlmReply, handleInitialMessage };
