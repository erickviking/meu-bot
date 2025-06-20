// src/handlers/webhook.handler.js
const config = require('../config'); // Importa a configuração principal
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

        // Decide qual handler de lógica chamar: o inicial ou o de fluxo da conversa.
        if (!session.firstName) {
            replyText = handleInitialMessage(session, text);
        } else {
            replyText = await handleConversationFlow(session, text);
        }
        
        // Adiciona a resposta do bot ao histórico antes de salvar.
        session.conversationHistory.push({ role: 'bot', content: replyText });
        await sessionManager.saveSession(from, session);

        // Envia a resposta para o usuário.
        await whatsappService.sendMessage(from, replyText);

        res.sendStatus(200);

    } catch (error) {
        console.error('❌ Erro fatal no webhook handler:', error);
        res.sendStatus(500);
    }
}

function verifyWebhook(req, res) {
    // AGORA: Lendo o token do módulo de configuração centralizado.
    const VERIFY_TOKEN = config.whatsapp.verifyToken;

    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) {
        console.log('✅ Webhook verificado com sucesso!');
        res.status(200).send(req.query['hub.challenge']);
    } else {
        console.error('❌ Falha na verificação do Webhook. Token recebido:', req.query['hub.verify_token']);
        res.sendStatus(403);
    }
}

module.exports = { processIncomingMessage, verifyWebhook };
