// src/handlers/nepq.handler.js
const config = require('../config');
const { OpenAI } = require('openai');
// A função 'formatAsName' não é mais necessária para extrair o nome.
// const { formatAsName } = require('../utils/helpers'); 
const { buildPromptForClinic } = require('../services/promptBuilder');

// Inicializa o cliente da OpenAI com a chave de API.
const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Função principal que se comunica com a LLM.
 * AGORA ELA PASSA A SESSÃO COMPLETA PARA O PROMPT BUILDER.
 * @param {object} session - O objeto de sessão completo do usuário.
 * @param {string} latestMessage - A última mensagem enviada pelo usuário.
 * @returns {Promise<object>} Um objeto contendo a resposta da IA e o novo estado da conversa.
 */
async function getLlmReply(session, latestMessage) {
    try {
        // --- INÍCIO DA CORREÇÃO ---
        // Agora passamos a sessão inteira para que o prompt seja sensível ao estado.
        const systemPrompt = buildPromptForClinic(session.clinicConfig, session);
        // --- FIM DA CORREÇÃO ---

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
            botReply.includes("Por isso o atendimento é particular.") ||
            botReply.includes("O valor da consulta é");

        if (isClosingStatement && session.state === 'nepq_discovery') {
            console.log(`[FSM] Fechamento detectado. Mudando estado para 'closing_delivered'.`);
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
 * REESCRITA: Gerencia a fase de onboarding usando IA para extrair o nome.
 * @returns {Promise<string | null>} A resposta do bot ou null se o onboarding estiver completo.
 */
async function handleInitialMessage(session, message, clinicConfig) {
    const currentState = session.onboardingState;
    const doctorName = clinicConfig.doctorName || 'nosso especialista';
    const secretaryName = clinicConfig.secretaryName || 'a secretária virtual';

    if (currentState === 'start') {
        session.onboardingState = 'awaiting_name';
        return `Olá! Bem-vindo ao consultório do ${doctorName}. Sou a secretária, ${secretaryName}. Com quem eu tenho o prazer de falar?`;
    }

    if (currentState === 'awaiting_name') {
        console.log(`[IA Onboarding] Tentando extrair nome da frase: "${message}"`);
        
        const nameExtractionResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { 
                    role: 'system', 
                    content: "Você é um especialista em extrair nomes de pessoas de frases em português. A frase a seguir é de um usuário se apresentando. Sua tarefa é extrair o nome DO USUÁRIO que está falando. O usuário pode dizer 'meu nome é...', 'eu sou o...', 'aqui é o...'. Ignore outros nomes que possam aparecer (como o nome do atendente). Responda APENAS com o primeiro nome do usuário. Se nenhum nome de usuário for encontrado, responda com a palavra 'NULL'."
                },
                { role: 'user', content: message }
            ],
            temperature: 0,
            max_tokens: 10,
        });

        const potentialName = nameExtractionResponse.choices[0].message.content.trim();

        if (!potentialName || potentialName.toUpperCase() === 'NULL' || potentialName.length < 2) {
            return `Desculpe, não consegui identificar seu nome. Por favor, poderia me dizer apenas como devo te chamar?`;
        }
        
        const formattedName = potentialName.charAt(0).toUpperCase() + potentialName.slice(1).toLowerCase();
        session.firstName = formattedName;
        session.onboardingState = 'complete';
        session.state = 'nepq_discovery';

        const welcomeMessage = `Perfeito, ${formattedName}! É um prazer falar com você. 😊 Para eu te ajudar da melhor forma, pode me contar o que te motivou a procurar o ${doctorName} hoje?`;

        session.conversationHistory = [];
        session.conversationHistory.push({ role: 'user', content: `O paciente disse que seu nome é ${formattedName}.` });
        session.conversationHistory.push({ role: 'assistant', content: welcomeMessage });
        
        return welcomeMessage;
    }

    return null;
}

module.exports = { getLlmReply, handleInitialMessage };
