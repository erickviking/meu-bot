const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { getLlmReply, handleInitialMessage } = require('./nepq.handler');
const { simulateTypingDelay } = require('../utils/helpers'); // Importa a nova função

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

async function processIncomingMessage(req, res) {
    try {
        const messageData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (!messageData || messageData.type !== 'text' || !messageData.text?.body) {
            return res.sendStatus(200);
        }

        const from = messageData.from;
        const text = messageData.text.body;

        // Responde imediatamente ao webhook para evitar timeouts da Meta.
        res.sendStatus(200);

        if (text.toLowerCase() === '/novaconversa') {
            await sessionManager.resetSession(from);
            console.log(`✅ Sessão para ${from} foi resetada manualmente.`);
        }

        const session = await sessionManager.getSession(from);
        
        let replyText = handleInitialMessage(session, text);

        if (replyText === null) {
            replyText = await getLlmReply(session, text);
        }

        // --- LÓGICA DE DELAY INTELIGENTE ---
        // Simula o bot "pensando" ou "digitando" antes de responder.
        if (replyText) {
            await simulateTypingDelay(replyText);
        }
        
        await sessionManager.saveSession(from, session);
        await sendMultiPartMessage(from, replyText);

    } catch (error) {
        console.error('❌ Erro fatal no webhook handler:', error);
        // Não enviamos mais res.sendStatus(500) porque já respondemos 200.
        // Apenas logamos o erro para monitoramento.
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
