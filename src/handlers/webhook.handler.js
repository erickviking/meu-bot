const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { getLlmReply, handleInitialMessage } = require('./nepq.handler');

/**
 * NOVO: Função para dividir uma resposta em parágrafos e enviá-los separadamente.
 * @param {string} to - O número do destinatário.
 * @param {string} fullText - O texto completo gerado pela LLM.
 */
async function sendMultiPartMessage(to, fullText) {
    // Divide o texto em parágrafos usando a quebra de linha dupla como delimitador.
    const paragraphs = fullText.split('\n\n').filter(p => p.trim().length > 0);

    for (let i = 0; i < paragraphs.length; i++) {
        const paragraph = paragraphs[i];
        await whatsappService.sendMessage(to, paragraph);

        // Adiciona um atraso natural entre as mensagens, exceto na última.
        if (i < paragraphs.length - 1) {
            // Um atraso entre 1.2 e 2 segundos para simular digitação.
            const delay = 1200 + Math.random() * 800;
            await new Promise(resolve => setTimeout(resolve, delay));
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

        if (text.toLowerCase() === '/novaconversa') {
            await sessionManager.client.del(`session:${from}`);
            console.log(`✅ Sessão para ${from} foi resetada manualmente.`);
        }

        const session = await sessionManager.getSession(from);
        
        let replyText = handleInitialMessage(session, text);

        if (replyText === null) {
            replyText = await getLlmReply(session, text);
        }
        
        await sessionManager.saveSession(from, session);

        // ALTERADO: Em vez de enviar a resposta diretamente, usamos nossa nova função.
        await sendMultiPartMessage(from, replyText);

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
        console.error('❌ Falha na verificação do Webhook.');
        res.sendStatus(403);
    }
}

module.exports = { processIncomingMessage, verifyWebhook };
