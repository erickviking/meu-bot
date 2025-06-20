// src/handlers/webhook.handler.js
const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { getLlmReply, handleInitialMessage } = require('./nepq.handler');

async function processIncomingMessage(req, res) {
    try {
        const messageData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (!messageData || messageData.type !== 'text' || !messageData.text?.body) {
            console.log('Webhook ignorado (não é mensagem de texto).');
            return res.sendStatus(200);
        }

        const from = messageData.from;
        const text = messageData.text.body;

        // Comando para resetar a sessão para fins de teste
        if (text.toLowerCase() === '/novaconversa') {
            await sessionManager.client.del(`session:${from}`);
            console.log(`✅ Sessão para ${from} foi resetada manualmente via comando.`);
            const newSessionOnReset = await sessionManager.getSession(from);
            const initialReply = handleInitialMessage(newSessionOnReset, text);
            await sessionManager.saveSession(from, newSessionOnReset);
            await whatsappService.sendMessage(from, initialReply);
            return res.sendStatus(200);
        }

        const session = await sessionManager.getSession(from);
        
        let replyText = '';

        if (!session.firstName) {
            replyText = handleInitialMessage(session, text);
        } else {
            replyText = await getLlmReply(session, text);
        }
        
        await sessionManager.saveSession(from, session);
        await whatsappService.sendMessage(from, replyText);

        res.sendStatus(200);

    } catch (error) {
        console.error('❌ Erro fatal no webhook handler:', error);
        res.sendStatus(500);
    }
}

// ===== A FUNÇÃO QUE FALTAVA FOI ADICIONADA AQUI =====
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
// ======================================================

module.exports = { processIncomingMessage, verifyWebhook };
