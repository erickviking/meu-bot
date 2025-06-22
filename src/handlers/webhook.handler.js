const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { getLlmReply } = require('./nepq.handler'); // Agora importamos apenas a função correta

// Usamos um Map em memória para gerenciar os timers. 
const debounceTimers = new Map();

async function processIncomingMessage(req, res) {
    try {
        const messageData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (!messageData || messageData.type !== 'text' || !messageData.text?.body) {
            return res.sendStatus(200);
        }

        const from = messageData.from;
        const text = messageData.text.body;

        // Se o comando for /novaconversa, limpa a sessão ANTES de processar
        if (text.toLowerCase() === '/novaconversa') {
            await sessionManager.client.del(`session:${from}`);
            console.log(`✅ Sessão para ${from} foi reiniciada.`);
        }

        // Lógica de Debouncing para agrupar mensagens rápidas
        if (debounceTimers.has(from)) {
            clearTimeout(debounceTimers.get(from).timer);
            debounceTimers.get(from).messages.push(text);
        } else {
            debounceTimers.set(from, { messages: [text], timer: null });
        }

        const newTimer = setTimeout(async () => {
            const bufferData = debounceTimers.get(from);
            if (!bufferData) return;

            const combinedText = bufferData.messages.join('\n');
            
            try {
                // A lógica inteira é agora delegada diretamente à LLM em todas as interações.
                const session = await sessionManager.getSession(from);
                const replyText = await getLlmReply(session, combinedText);
                
                await sessionManager.saveSession(from, session);
                await whatsappService.sendMessage(from, replyText);
            } catch (processingError) {
                console.error('❌ Erro durante o processamento assíncrono do debounce:', processingError);
            } finally {
                debounceTimers.delete(from);
            }
        }, 3000);

        debounceTimers.get(from).timer = newTimer;

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
