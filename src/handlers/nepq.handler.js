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

// File: src/handlers/nepq.handler.js

// ... (outros imports e a função getLlmReply permanecem os mesmos) ...

/**
 * VERSÃO FINAL E AVANÇADA: Gerencia o onboarding usando IA para extrair o nome
 * com um processo de raciocínio e resposta em JSON.
 * @returns {Promise<string | null>}
 */
async function handleInitialMessage(session, message, clinicConfig) {
    const currentState = session.onboardingState;
    const doctorName = clinicConfig.doctorName || 'nosso especialista';
    const secretaryName = clinicConfig.secretaryName || 'a secretária virtual';

    if (currentState === 'start') {
        session.onboardingState = 'awaiting_name';
        return `Olá! Bem-vindo(a) ao consultório do Dr. ${doctorName}. Sou a secretária virtual, ${secretaryName}. Com quem eu tenho o prazer de falar? 😊`;
    }

    if (currentState === 'awaiting_name') {
        console.log(`[IA Onboarding] Tentando extrair nome da frase: "${message}"`);
        
        // --- NOVO PROMPT ESTRUTURADO ---
        const nameExtractionPrompt = `
        Sua tarefa é analisar a frase de um usuário que está se apresentando para uma secretária chamada 'Ana' e extrair o primeiro nome do usuário.

        Siga este processo de raciocínio:
        1. Analise a frase: "${message}".
        2. Identifique todos os nomes de pessoas na frase.
        3. Determine qual nome pertence ao USUÁRIO que está falando, ignorando o nome da secretária ('Ana').
        4. Se um nome de usuário for encontrado, coloque-o no campo 'extracted_name'.
        5. Se nenhum nome de usuário for encontrado, ou se for apenas um cumprimento, o valor de 'extracted_name' deve ser null.

        Responda APENAS com um objeto JSON válido, seguindo este formato:
        {
          "reasoning": "Seu raciocínio passo a passo aqui.",
          "extracted_name": "PrimeiroNomeDoUsuario"
        }
        `;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'system', content: nameExtractionPrompt }],
            // Força a IA a retornar uma resposta no formato JSON
            response_format: { type: "json_object" } 
        });

        const responseContent = response.choices[0].message.content;
        console.log('[IA Onboarding] Resposta JSON da IA:', responseContent);

        try {
            const result = JSON.parse(responseContent);
            const potentialName = result.extracted_name;

            if (!potentialName || potentialName.length < 2) {
                return `Desculpe, não consegui identificar seu nome. Por favor, poderia me dizer apenas como devo te chamar?`;
            }

            const formattedName = potentialName.split(" ")[0].charAt(0).toUpperCase() + potentialName.split(" ")[0].slice(1).toLowerCase();
            session.firstName = formattedName;
            session.onboardingState = 'complete';
            session.state = 'nepq_discovery';

            const welcomeMessage = `Perfeito, ${formattedName}! É um prazer falar com você. 😊 Para eu te ajudar da melhor forma, pode me contar o que te motivou a procurar o Dr. ${doctorName} hoje?`;
            session.conversationHistory = [
                { role: 'user', content: `O paciente se apresentou como ${formattedName}.` },
                { role: 'assistant', content: welcomeMessage }
            ];
            
            return welcomeMessage;
        } catch (e) {
            console.error("Erro ao processar JSON da IA:", e);
            return `Desculpe, estou com uma dificuldade técnica para entender sua resposta. Poderia repetir seu nome, por favor?`;
        }
    }

    return null;
}

// Lembre-se de que a exportação e a chamada no webhook.handler.js devem ser async
module.exports = { getLlmReply, handleInitialMessage };
