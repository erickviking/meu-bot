const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { getLlmReply } = require('./nepq.handler');
const { simulateTypingDelay } = require('../utils/helpers');

// Armazenamento em memória para gerenciar os temporizadores de debounce.
const debounceTimers = new Map();

// Função para enviar mensagens em múltiplos parágrafos.
async function sendMultiPartMessage(to, fullText) {
    if (!fullText) return;
    const paragraphs = fullText.split('\n\n').filter(p => p.trim().length > 0);
    for (const paragraph of paragraphs) {
        await whatsappService.sendMessage(to, paragraph);
        const interMessageDelay = 1200 + Math.random() * 800;
        await new Promise(resolve => setTimeout(resolve, interMessageDelay));
    }
}

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
            await sessionManager.resetSession(from);
            console.log(`✅ Sessão para ${from} foi resetada manualmente.`);
            const session = await sessionManager.getSession(from);
            const replyText = handleInitialMessage(session, "");
            await sessionManager.saveSession(from, session);
            await sendMultiPartMessage(from, replyText);
            return;
        }

        const session = await sessionManager.getSession(from);

        // --- NOVA ARQUITETURA DE FLUXO ---
        // 1. Se o onboarding não estiver completo, processa a mensagem INSTANTANEAMENTE.
        if (session.onboardingState !== 'complete') {
            const replyText = handleInitialMessage(session, text);
            await sessionManager.saveSession(from, session);
            await sendMultiPartMessage(from, replyText);
        } 
        // 2. Se o onboarding estiver completo, entra na lógica de DEBOUNCE.
        else {
            if (debounceTimers.has(from)) {
                clearTimeout(debounceTimers.get(from));
            }

            const userBuffer = session.messageBuffer || [];
            userBuffer.push(text);
            session.messageBuffer = userBuffer;
            await sessionManager.saveSession(from, session);

            const newTimer = setTimeout(async () => {
                const currentSession = await sessionManager.getSession(from);
                const fullMessage = (currentSession.messageBuffer || []).join('. ');
                currentSession.messageBuffer = []; // Limpa o buffer

                if (fullMessage) {
                    const replyText = await getLlmReply(currentSession, fullMessage);
                    await simulateTypingDelay(replyText);
                    await sessionManager.saveSession(from, currentSession);
                    await sendMultiPartMessage(from, replyText);
                }
                debounceTimers.delete(from);
            }, 6000); // Aguarda 6.0 segundos

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
