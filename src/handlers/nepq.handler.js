// src/handlers/nepq.handler.js
const config = require('../config');
const { OpenAI } = require('openai');
const { formatAsName } = require('../utils/helpers');
const { buildPromptForClinic } = require('../services/promptBuilder'); // Importa o novo serviço

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// A função agora recebe a configuração da clínica como um parâmetro
async function getLlmReply(session, latestMessage, clinicConfig) {
    try {
        // Constrói o prompt dinamicamente para cada chamada
        const systemPrompt = buildPromptForClinic(clinicConfig);

        const messages = [
            { role: 'system', content: systemPrompt },
            ...session.conversationHistory,
            { role: 'user', content: latestMessage }
        ];

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
            temperature: 0.7,
            max_tokens: 500,
        });

        const botReply = response.choices[0].message.content;

        // ... o resto da função permanece igual
        session.conversationHistory.push({ role: 'user', content: latestMessage });
        session.conversationHistory.push({ role: 'assistant', content: botReply });
        if (session.conversationHistory.length > 12) {
            session.conversationHistory = session.conversationHistory.slice(-12);
        }
        return botReply;

    } catch (error) {
        console.error('🚨 Erro na chamada da API da OpenAI:', error);
        return `Desculpe, ${session.firstName || 'amigo(a)'}, estou com uma dificuldade técnica.`;
    }
}

// O handleInitialMessage agora recebe clinicConfig para personalizar a saudação.
function handleInitialMessage(session, clinicConfig) {
    const currentState = session.onboardingState;
    const doctorName = clinicConfig.doctorName || 'nosso especialista';
    const secretaryName = clinicConfig.secretaryName || 'Ana';

    if (currentState === 'start') {
        session.onboardingState = 'awaiting_name';
        return `Olá! Bem-vindo(a) ao consultório do ${doctorName}. Sou a secretária virtual "${secretaryName}". Com quem eu tenho o prazer de falar? 😊`;
    }

    if (currentState === 'awaiting_name') {
        const potentialName = formatAsName(message);
        if (!potentialName) { /* ... lógica de validação ... */ }
        
        session.firstName = potentialName;
        session.onboardingState = 'complete';

        const welcomeMessage = `Perfeito, ${potentialName}! É um prazer falar com você. 😊 Para eu te ajudar da melhor forma, pode me contar o que te motivou a procurar o ${doctorName} hoje?`;
        
        // ... o resto da lógica permanece igual
        return welcomeMessage;
    }

    return null;
}

module.exports = { getLlmReply, handleInitialMessage };
