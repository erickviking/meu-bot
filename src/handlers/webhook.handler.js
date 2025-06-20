// src/handlers/webhook.handler.js
const config = require('../config');
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

        // --- LÓGICA PARA INICIAR NOVA SESSÃO ---
        // Verificamos se a mensagem do usuário é o nosso comando secreto.
        // É uma boa prática usar uma barra (/) para indicar um comando.
        if (text.toLowerCase() === '/novaconversa') {
            // Deleta a sessão antiga do Redis associada a este número de telefone.
            await sessionManager.client.del(`session:${from}`);
            
            console.log(`✅ Sessão para ${from} foi resetada manualmente via comando.`);
            
            // Envia uma confirmação e inicia a nova conversa.
            const newSession = await sessionManager.getSession(from); // Cria a nova sessão
            const replyText = handleInitialMessage(newSession, text);
            await sessionManager.saveSession(from, newSession);
            await whatsappService.sendMessage(from, replyText);
            
            return res.sendStatus(200);
        }
        // --- FIM DA LÓGICA DE RESET ---

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
        res.sendStatus(500);
    }
}

function verifyWebhook(req, res) {
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
