// src/handlers/webhook.handler.js
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
// ATENÇÃO: Mudamos os nomes das funções importadas
const { getLlmReply, handleInitialMessage } = require('./nepq.handler');

async function processIncomingMessage(req, res) {
    try {
        // ... (código de validação da mensagem inicial continua o mesmo)
        const messageData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!messageData || messageData.type !== 'text' || !messageData.text?.body) {
            return res.sendStatus(200);
        }

        const from = messageData.from;
        const text = messageData.text.body;

        const session = await sessionManager.getSession(from);
        
        let replyText = '';

        if (!session.firstName) {
            replyText = handleInitialMessage(session, text);
        } else {
            // AGORA: Chamamos a função que acessa a LLM em toda mensagem.
            replyText = await getLlmReply(session, text);
        }
        
        // O salvamento da sessão agora é feito dentro da função getLlmReply
        await sessionManager.saveSession(from, session);

        await whatsappService.sendMessage(from, replyText);

        res.sendStatus(200);

    } catch (error) {
        console.error('❌ Erro fatal no webhook handler:', error);
        res.sendStatus(500);
    }
}

// ... (a função verifyWebhook continua a mesma)

module.exports = { processIncomingMessage, verifyWebhook };
