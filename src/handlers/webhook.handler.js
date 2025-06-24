const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { getLlmReply, handleInitialMessage } = require('./nepq.handler');
const { simulateTypingDelay } = require('../utils/helpers');

// Armazenamento em memória para gerenciar os temporizadores de debounce.
const debounceTimers = new Map();

// Função para enviar mensagens em múltiplos parágrafos.
async function sendMultiPartMessage(to, fullText) {
    if (!fullText) return;
    const paragraphs = fullText.split('\n\n').filter(p => p.trim().length > 0);
    for (const paragraph of paragraphs) {
        await whatsappService.sendMessage(to, paragraph);
        // Adiciona um delay entre os parágrafos para uma leitura mais natural
        if (paragraphs.length > 1) {
            const interMessageDelay = 1500 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, interMessageDelay));
        }
    }
}

/**
 * Processa as mensagens que foram agrupadas durante a "Pausa para Ouvir".
 * @param {string} from - O número de telefone do remetente.
 */
async function processBufferedMessages(from) {
    const session = await sessionManager.getSession(from);
    const bufferedMessages = session.messageBuffer || [];
    
    if (bufferedMessages.length === 0) return;

    const fullMessage = bufferedMessages.join('. ');
    
    // Limpa o buffer ANTES de processar para evitar condições de corrida.
    session.messageBuffer = [];
    await sessionManager.saveSession(from, session);
    
    const replyText = await getLlmReply(session, fullMessage);
    
    if (replyText) {
        // "Pausa para Falar" - simula o tempo de digitação.
        await simulateTypingDelay(replyText);
    }
    
    await sessionManager.saveSession(from, session);
    await sendMultiPartMessage(from, replyText);

    debounceTimers.delete(from);
}

/**
 * O maestro do webhook, agora com uma arquitetura de ritmo que distingue
 * entre o onboarding (imediato) e a conversa principal (com delay).
 */
async function processIncomingMessage(req, res) {
    try {
        const messageData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!messageData || messageData.type !== 'text' || !messageData.text?.body) {
            return res.sendStatus(200);
        }

        const from = messageData.from;
        const text = messageData.text.body;

        // Responde IMEDIATAMENTE ao webhook da Meta para evitar timeouts.
        res.sendStatus(200);

        if (text.toLowerCase() === '/novaconversa') {
            if (debounceTimers.has(from)) clearTimeout(debounceTimers.get(from));
            debounceTimers.delete(from);
            await sessionManager.resetSession(from);
            console.log(`✅ Sessão para ${from} foi resetada.`);
            
            const session = await sessionManager.getSession(from);
            const replyText = handleInitialMessage(session, "");
            await sessionManager.saveSession(from, session);
            await sendMultiPartMessage(from, replyText);
            return;
        }

        const session = await sessionManager.getSession(from);

        // --- ARQUITETURA DE RITMO CONVERSACIONAL ---

        // 1. Se o onboarding não estiver completo, processa a mensagem INSTANTANEAMENTE.
        if (session.onboardingState !== 'complete') {
            const replyText = handleInitialMessage(session, text);
            await sessionManager.saveSession(from, session);
            await sendMultiPartMessage(from, replyText);
        } 
        // 2. Se o onboarding estiver completo, entra na lógica de DEBOUNCING.
        else {
            if (debounceTimers.has(from)) {
                clearTimeout(debounceTimers.get(from));
            }

            const userBuffer = session.messageBuffer || [];
            userBuffer.push(text);
            session.messageBuffer = userBuffer;
            await sessionManager.saveSession(from, session);

            const newTimer = setTimeout(() => {
                processBufferedMessages(from);
            }, 3500); // Aguarda 3.5 segundos por mais mensagens.

            debounceTimers.set(from, newTimer);
        }

    } catch (error) {
        console.error('❌ Erro fatal no webhook handler:', error);
    }
}

function verifyWebhook(req, res) {
    const VERIFY_TOKEN = config.whatsapp.verifyToken;
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
        console.log('✅ Webhook verificado com sucesso!');
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error('❌ Falha na verificação do Webhook.');
        res.sendStatus(403);
    }
}

module.exports = { processIncomingMessage, verifyWebhook };
