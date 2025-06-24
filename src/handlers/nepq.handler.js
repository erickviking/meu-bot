// src/handlers/nepq.handler.js
const config = require('../config');
const { OpenAI } = require('openai');
const { formatAsName } = require('../utils/helpers');
const { buildPromptForClinic } = require('../services/promptBuilder');

// Inicializa o cliente da OpenAI com a chave de API.
const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Função principal que se comunica com a LLM e gerencia a lógica da conversa.
 * Agora, ela também detecta a transição de estado para o fechamento.
 * @param {object} session - O objeto de sessão completo do usuário, incluindo a 'clinicConfig'.
 * @param {string} latestMessage - A última mensagem enviada pelo usuário.
 * @returns {Promise<object>} Um objeto contendo a resposta da IA e o novo estado da conversa.
 */
async function getLlmReply(session, latestMessage) {
    try {
        const systemPrompt = buildPromptForClinic(session.clinicConfig);

        const messages = [
            { role: 'system', content: systemPrompt },
            ...session.conversationHistory,
            { role: 'user', content: latestMessage }
        ];

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
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

        const isClosingStatement = 
            botReply.includes("Por isso o atendimento é particular.") &&
            botReply.includes("investigação profunda para encontrar a \"causa raiz\"");

        if (isClosingStatement) {
            console.log(`[FSM] Fechamento detectado na resposta da IA. Mudando estado para 'closing_delivered'.`);
            return { reply: botReply, newState: 'closing_delivered' };
        }

        return { reply: botReply, newState: session.state };

    } catch (error) {
        console.error('🚨 Erro na chamada da API da OpenAI:', error);
        return { 
            reply: `Desculpe, ${session.firstName || 'amigo(a)'}, estou com uma dificuldade técnica.`,
            newState: session.state 
        };
    }
}

/**
 * Gerencia a fase inicial de onboarding para obter o nome do usuário.
 * @param {object} session - O objeto de sessão do usuário.
 * @param {string} message - A mensagem do usuário.
 * @param {object} clinicConfig - A configuração da clínica.
 * @returns {string | null} A resposta do bot ou null se o onboarding estiver completo.
 */
function handleInitialMessage(session, message, clinicConfig) {
    const currentState = session.onboardingState;
    const doctorName = clinicConfig.doctorName || 'nosso especialista';
    const secretaryName = clinicConfig.secretaryName || 'a secretária virtual';

    if (currentState === 'start') {
        session.onboardingState = 'awaiting_name';
        return `Olá! Bem-vindo(a) ao consultório do ${doctorName}. Sou a secretária virtual, ${secretaryName}. Com quem eu tenho o prazer de falar? 😊`;
    }

    if (currentState === 'awaiting_name') {
        const potentialName = formatAsName(message);
        const invalidNames = ['oi', 'ola', 'bom', 'boa', 'tarde', 'noite', 'dia'];
        
        if (!potentialName || invalidNames.includes(potentialName.toLowerCase())) {
            return `Desculpe, não consegui identificar seu nome. Por favor, me diga apenas como devo te chamar.`;
        }
        
        session.firstName = potentialName;
        session.onboardingState = 'complete';
        session.state = 'nepq_discovery';

        const welcomeMessage = `Perfeito, ${potentialName}! É um prazer falar com você. 😊 Para eu te ajudar da melhor forma, pode me contar o que te motivou a procurar o ${doctorName} hoje?`;

        session.conversationHistory = [];
        session.conversationHistory.push({ role: 'user', content: `Meu nome é ${potentialName}.` });
        session.conversationHistory.push({ role: 'assistant', content: welcomeMessage });
        
        return welcomeMessage;
    }

    return null;
}

module.exports = { getLlmReply, handleInitialMessage };
