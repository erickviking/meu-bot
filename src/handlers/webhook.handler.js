// src/handlers/webhook.handler.js
const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { getLlmReply, handleInitialMessage } = require('./nepq.handler');

// Buffer para gerenciar tanto os timers quanto as mensagens agrupadas por usuário.
const messageBuffer = new Map();

async function processIncomingMessage(req, res) {
    try {
        const messageData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (!messageData || messageData.type !== 'text' || !messageData.text?.body) {
            return res.sendStatus(200);
        }

        const from = messageData.from;
        const text = messageData.text.body;

        // --- LÓGICA DE DEBOUNCING COM AGRUPAMENTO DE MENSAGENS ---

        // 1. Verifica se já existe um buffer para este usuário.
        if (messageBuffer.has(from)) {
            const bufferData = messageBuffer.get(from);
            
            // Cancela o timer anterior para dar prioridade à nova atividade.
            clearTimeout(bufferData.timer);
            
            // Adiciona a nova mensagem ao buffer existente.
            bufferData.messages.push(text);
            console.log(`[Buffer] Mensagem adicionada para ${from}. Buffer atual: ${bufferData.messages.length} mensagens.`);

        } else {
            // Se não existe, cria um novo buffer para este usuário.
            messageBuffer.set(from, { messages: [text], timer: null });
            console.log(`[Buffer] Novo buffer criado para ${from}.`);
        }

        // 2. Cria um novo timer de 3 segundos.
        const newTimer = setTimeout(async () => {
            const bufferedData = messageBuffer.get(from);
            if (!bufferedData) return; // Segurança extra

            // Une todas as mensagens acumuladas em um único texto coeso.
            const combinedText = bufferedData.messages.join('. ');
            console.log(`[Debounce] Timer para ${from} finalizado. Processando texto combinado: "${combinedText}"`);
            
            try {
                // A lógica principal agora roda DENTRO do callback, usando o texto combinado.
                const session = await sessionManager.getSession(from);
                
                let replyText = handleInitialMessage(session, combinedText);

                if (replyText === null) {
                    replyText = await getLlmReply(session, combinedText);
                }
                
                await sessionManager.saveSession(from, session);
                await whatsappService.sendMessage(from, replyText);

            } catch (processingError) {
                console.error('❌ Erro durante o processamento assíncrono do debounce:', processingError);
            } finally {
                // Limpa o buffer para este usuário após o processamento.
                messageBuffer.delete(from);
            }
        }, 3000); // Delay de 3 segundos

        // 3. Armazena o ID do novo timer no buffer.
        messageBuffer.get(from).timer = newTimer;

        // --- FIM DA LÓGICA DE DEBOUNCING ---

        // Responde IMEDIATAMENTE à Meta com status 200 para confirmar o recebimento.
        // O processamento real e a resposta ao usuário acontecerão de forma assíncrona.
        res.sendStatus(200);

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
