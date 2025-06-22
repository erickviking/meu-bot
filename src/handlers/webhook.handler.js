const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
// ATENÇÃO: Agora só importamos UMA função, a principal.
const { getLlmReply } = require('./nepq.handler');

async function processIncomingMessage(req, res) {
    try {
        const messageData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (!messageData || messageData.type !== 'text' || !messageData.text?.body) {
            // Ignora qualquer coisa que não seja uma mensagem de texto.
            return res.sendStatus(200);
        }

        const from = messageData.from;
        const text = messageData.text.body;

        // Comando de reset agora apenas limpa a sessão. A LLM cuidará da nova saudação.
        if (text.toLowerCase() === '/novaconversa') {
            await sessionManager.client.del(`session:${from}`);
            console.log(`✅ Sessão para ${from} foi resetada.`);
        }

        const session = await sessionManager.getSession(from);
        
        // A lógica inteira agora é delegada à LLM em todas as interações.
        // Não há mais a necessidade de um fluxo separado para o onboarding.
        const replyText = await getLlmReply(session, text);
        
        // Salva a sessão com o histórico atualizado pela função getLlmReply.
        await sessionManager.saveSession(from, session);

        // Envia a resposta gerada pela IA para o usuário.
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
        console.error('❌ Falha na verificação do Webhook.');
        res.sendStatus(403);
    }
}

module.exports = { processIncomingMessage, verifyWebhook };
