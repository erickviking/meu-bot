// src/handlers/webhook.handler.js
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { handleConversationFlow, handleInitialMessage } = require('./nepq.handler');

async function processIncomingMessage(req, res) {
    try {
        const messageData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (!messageData || messageData.type !== 'text' || !messageData.text?.body) {
            console.log('Webhook ignorado (não é mensagem de texto).');
            return res.sendStatus(200);
        }

        const from = messageData.from;
        const text = messageData.text.body;

        const session = await sessionManager.getSession(from);
        
        let replyText = '';

        if (!session.firstName) {
            replyText = handleInitialMessage(session, text);
        } else {
            replyText = await handleConversationFlow(session, text);
        }

        session.conversationHistory.push({ role: 'bot', content: replyText });
        await sessionManager.saveSession(from, session);

        await whatsappService.sendMessage(from, replyText);

        res.sendStatus(200);

    } catch (error) {
        console.error('❌ Erro fatal no webhook handler:', error);
        res.sendStatus(500); // Responde com erro para notificar a Meta que algo falhou.
    }
}

function verifyWebhook(req, res) {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
        console.log('✅ Webhook verificado com sucesso!');
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error('❌ Falha na verificação do Webhook.');
        res.sendStatus(403);
    }
}

module.exports = { processIncomingMessage, verifyWebhook };
