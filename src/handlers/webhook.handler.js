const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { getLlmReply, handleInitialMessage } = require('./nepq.handler');
const { simulateTypingDelay } = require('../utils/helpers');

// Armazenamento em memória para gerenciar os temporizadores e buffers de mensagem por usuário.
const debounceTimers = new Map();
const messageBuffer = new Map();

/**
 * Função que envia a resposta em múltiplos parágrafos, com pausas naturais.
 */
async function sendMultiPartMessage(to, fullText) {
    if (!fullText) return;
    const paragraphs = fullText.split('\n\n').filter(p => p.trim().length > 0);

    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        await whatsappService.sendMessage(to, paragraph);
        if (i < paragraphs.length - 1) {
            const interMessageDelay = 1200 + Math.random() * 800;
            await new Promise(resolve => setTimeout(resolve, interMessageDelay));
        }
    }
}

/**
 * Processa as mensagens que foram agrupadas durante a "Pausa para Ouvir".
 * @param {string} from - O número de telefone do remetente.
 */
async function processBufferedMessages(from) {
    const bufferedMessages = messageBuffer.get(from) || [];
    if (bufferedMessages.length === 0) return;

    // Junta as mensagens em um único texto para a IA.
    const fullMessage = bufferedMessages.join('. ');
    console.log(`[Debounce] Processando mensagem agrupada de ${from}: "${fullMessage}"`);

    const session = await sessionManager.getSession(from);
    
    let replyText = handleInitialMessage(session, fullMessage);

    if (replyText === null) {
        replyText = await getLlmReply(session, fullMessage);
    }

    // "Pausa para Falar": Simula o bot pensando/digitando antes de responder.
    if (replyText) {
        await simulateTypingDelay(replyText);
    }
    
    await sessionManager.saveSession(from, session);
    await sendMultiPartMessage(from, replyText);

    // Limpa o buffer e o temporizador para este usuário.
    messageBuffer.delete(from);
    debounceTimers.delete(from);
}

/**
 * O maestro do webhook, agora com a lógica de "Pausa para Ouvir".
 */
async function processIncomingMessage(req, res) {
    try {
        const messageData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (!messageData || messageData.type !== 'text' || !messageData.text?.body) {
            return res.sendStatus(200);
        }

        const from = messageData.from;
        const text = messageData.text.body;

        // Responde IMEDIATAMENTE ao webhook para evitar timeouts da Meta.
        // O processamento real acontecerá após o delay.
        res.sendStatus(200);

        if (text.toLowerCase() === '/novaconversa') {
            await sessionManager.resetSession(from);
            console.log(`✅ Sessão para ${from} foi resetada manualmente.`);
            // Envia a saudação inicial sem delay.
            const session = await sessionManager.getSession(from);

            // Nota: handleInitialMessage foi projetado para ser chamado com o estado 'start', 
            // que é o estado de uma sessão recém-criada/resetada.
            const replyText = handleInitialMessage(session, "");
            await sessionManager.saveSession(from, session);
            await sendMultiPartMessage(from, replyText);
            return;
        }

        // --- LÓGICA DE DEBOUNCING (Pausa para Ouvir) ---

        // 1. Limpa qualquer temporizador antigo para este usuário.
        if (debounceTimers.has(from)) {
            clearTimeout(debounceTimers.get(from));
        }

        // 2. Adiciona a nova mensagem ao buffer do usuário.
        const userBuffer = messageBuffer.get(from) || [];
        userBuffer.push(text);
        messageBuffer.set(from, userBuffer);

        // 3. Define um novo temporizador.
        const newTimer = setTimeout(() => {
            processBufferedMessages(from);
        }, 3500); // Aguarda 3.5 segundos por mais mensagens.

        debounceTimers.set(from, newTimer);

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
