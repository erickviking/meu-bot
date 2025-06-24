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
 * * @param {object} session - O objeto de sessão completo do usuário, incluindo a 'clinicConfig'.
 * @param {string} latestMessage - A última mensagem enviada pelo usuário.
 * @returns {Promise<object>} Um objeto contendo a resposta da IA e o novo estado da conversa.
 */
async function getLlmReply(session, latestMessage) {
    try {
        // Passo 1: Construir o prompt do sistema dinamicamente com base nos dados da clínica na sessão.
        const systemPrompt = buildPromptForClinic(session.clinicConfig);

        // Passo 2: Montar o histórico da conversa para enviar à API.
        const messages = [
            { role: 'system', content: systemPrompt },
            ...session.conversationHistory,
            { role: 'user', content: latestMessage }
        ];

        // Passo 3: Chamar a API da OpenAI.
        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // Essencial usar o modelo mais capaz para seguir as instruções complexas.
            messages,
            temperature: 0.7,
            max_tokens: 600, // Aumentamos o limite para acomodar a longa resposta de fechamento.
        });

        const botReply = response.choices[0].message.content;

        // Passo 4: Atualizar o histórico da sessão com a nova interação.
        session.conversationHistory.push({ role: 'user', content: latestMessage });
        session.conversationHistory.push({ role: 'assistant', content: botReply });
        
        // Mantém o histórico com um tamanho gerenciável.
        if (session.conversationHistory.length > 12) {
            session.conversationHistory = session.conversationHistory.slice(-12);
        }

        // Passo 5: Lógica de Detecção de Estado.
        // Usamos uma heurística para identificar se a resposta gerada é o fechamento de 6 parágrafos.
        // Escolhemos frases-chave únicas que só devem aparecer nesse template específico.
        const isClosingStatement = 
            botReply.includes("Por isso o atendimento é particular.") &&
            botReply.includes("investigação profunda para encontrar a \"causa raiz\"");

        // Se o fechamento for detectado, retornamos a resposta junto com a indicação de novo estado.
        if (isClosingStatement) {
            console.log(`[FSM] Fechamento detectado na resposta da IA. Mudando estado para 'closing_delivered'.`);
            return { reply: botReply, newState: 'closing_delivered' };
        }

        // Se não for o fechamento, apenas retornamos a resposta, mantendo o estado atual.
        return { reply: botReply, newState: session.state };

    } catch (error) {
        console.error('🚨 Erro na chamada da API da OpenAI:', error);
        // Em caso de erro, retorna uma mensagem de falha e mantém o estado.
        return { 
            reply: `Desculpe, ${session.firstName || 'amigo(a)'}, estou com uma dificuldade técnica.`,
            newState: session.state 
        };
    }
}

/**
 * Gerencia a fase inicial de onboarding para obter o nome do usuário.
 * Esta função é um exemplo de como lidar com a transição do estado 'onboarding' para 'nepq_discovery'.
 * * @param {object} session - O objeto de sessão do usuário.
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
        session.onboardingState = 'complete'; // Onboarding de nome finalizado.
        session.state = 'nepq_discovery';     // MUDANÇA DE ESTADO PRINCIPAL!

        const welcomeMessage = `Perfeito, ${potentialName}! É um prazer falar com você. 😊 Para eu te ajudar da melhor forma, pode me contar o que te motivou a procurar o ${doctorName} hoje?`;

        // Zera o histórico para começar a conversa NEPQ de forma limpa.
        session.conversationHistory = [];
        session.conversationHistory.push({ role: 'user', content: `Meu nome é ${potentialName}.` });
        session.conversationHistory.push({ role: 'assistant', content: welcomeMessage });
        
        return welcomeMessage;
    }

    // Se o onboarding já foi completo, retorna null para que a lógica principal (getLlmReply) assuma.
    return null;
}

module.exports = { getLlmReply, handleInitialMessage };
}

module.exports = { getLlmReply, handleInitialMessage };
