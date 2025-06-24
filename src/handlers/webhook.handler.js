// src/handlers/webhook.handler.js
const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { getLlmReply, handleInitialMessage } = require('./nepq.handler');
const { simulateTypingDelay } = require('../utils/helpers');
const { isEmergency, getEmergencyResponse } = require('../utils/emergencyDetector');
const { detetarObjeção } = require('./objection.handler');

// Armazenamento em memória para gerenciar os temporizadores de debounce.
const debounceTimers = new Map();

/**
 * Envia mensagens longas divididas em múltiplos parágrafos para uma UX melhor.
 * @param {string} to - O número do destinatário.
 * @param {string} fullText - O texto completo a ser enviado.
 */
async function sendMultiPartMessage(to, fullText) {
    if (!fullText) return;
    const paragraphs = fullText.split('\n\n').filter(p => p.trim().length > 0);
    for (const paragraph of paragraphs) {
        await whatsappService.sendMessage(to, paragraph);
        if (paragraphs.length > 1) {
            const interMessageDelay = 1500 + Math.random() * 1000;
            await new Promise(resolve => setTimeout(resolve, interMessageDelay));
        }
    }
}

/**
 * Processa as mensagens agrupadas após a "Pausa para Ouvir" (debounce).
 * Esta função agora lida com a resposta em objeto do getLlmReply para atualizar o estado.
 * @param {string} from - O número do remetente.
 */
async function processBufferedMessages(from) {
    const session = await sessionManager.getSession(from);
    const bufferedMessages = session.messageBuffer || [];
    
    if (bufferedMessages.length === 0) {
        debounceTimers.delete(from);
        return;
    }

    const fullMessage = bufferedMessages.join('. ');
    console.log(`[Debounce] Processando mensagem agrupada de ${from}: "${fullMessage}"`);
    
    // Limpa o buffer ANTES de processar para evitar condições de corrida.
    session.messageBuffer = [];
    
    // Chama a IA para obter a resposta e o possível novo estado.
    const llmResult = await getLlmReply(session, fullMessage);
    
    // Atualiza o estado da sessão se a IA indicou uma mudança.
    if (llmResult.newState && llmResult.newState !== session.state) {
        session.state = llmResult.newState;
    }
    
    // Salva a sessão com o histórico atualizado e o novo estado.
    await sessionManager.saveSession(from, session);
    
    // Envia a resposta da IA para o usuário.
    if (llmResult.reply) {
        await simulateTypingDelay(llmResult.reply);
        await sendMultiPartMessage(from, llmResult.reply);
    }

    debounceTimers.delete(from);
}

/**
 * Ponto de entrada principal para todas as mensagens recebidas do WhatsApp.
 * Orquestra o fluxo usando a Máquina de Estados Finita (FSM).
 * @param {object} req - O objeto de requisição do Express.
 * @param {object} res - O objeto de resposta do Express.
 */
async function processIncomingMessage(req, res) {
    try {
        const messageData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!messageData || messageData.type !== 'text' || !messageData.text?.body) {
            return res.sendStatus(200);
        }

        const from = messageData.from;
        const text = messageData.text.body;

        res.sendStatus(200); // Responda à Meta imediatamente.

        // Comando de reset de sessão tem prioridade máxima.
        if (text.toLowerCase() === '/novaconversa') {
            if (debounceTimers.has(from)) clearTimeout(debounceTimers.get(from));
            debounceTimers.delete(from);
            await sessionManager.resetSession(from);
            console.log(`✅ Sessão para ${from} foi resetada.`);
            await whatsappService.sendMessage(from, "Sessão reiniciada. Pode começar uma nova conversa.");
            return;
        }

        // Carrega a sessão, que já contém a FSM e a config da clínica.
        const session = await sessionManager.getSession(from);

        // --- INÍCIO DO ESCUDO DE PROTEÇÃO (GUARDRAILS) ---
        // 1. VERIFICAÇÃO DE EMERGÊNCIA (PRIORIDADE MÁXIMA)
        if (isEmergency(text)) {
            console.log(`🚨 [Guardrail] Emergência detectada para ${from}.`);
            const emergencyResponse = getEmergencyResponse(session.firstName);
            await whatsappService.sendMessage(from, emergencyResponse);
            return; // Interrompe o fluxo.
        }
        
        // --- LÓGICA DA MÁQUINA DE ESTADOS (FSM) ---
        // Se o onboarding inicial ainda não foi concluído.
        if (session.onboardingState !== 'complete') {
            const onboardingResponse = handleInitialMessage(session, text, session.clinicConfig);
            if (onboardingResponse) {
                await sessionManager.saveSession(from, session); // Salva o novo estado de onboarding
                await simulateTypingDelay(onboardingResponse);
                await whatsappService.sendMessage(from, onboardingResponse);
                return;
            }
        }

        // Se o estado é 'closing_delivered', ativamos o detector de objeções.
        if (session.state === 'closing_delivered') {
            console.log(`[FSM] Estado 'closing_delivered'. Verificando objeções para: "${text}"`);
            const objectionResponse = detetarObjeção(text, session.firstName);
            if (objectionResponse) {
                console.log(`💡 [Guardrail] Objeção pós-fechamento detectada.`);
                await simulateTypingDelay(objectionResponse);
                await whatsappService.sendMessage(from, objectionResponse);
                return; // Interrompe o fluxo e aguarda a próxima resposta do usuário.
            }
        }

        // Se a mensagem passou por todas as verificações, ela segue para o fluxo normal com a IA.
        console.log(`[FSM] Mensagem de ${from} no estado '${session.state}' segue para a IA.`);

        // --- FLUXO NORMAL DE CONVERSA (DEBOUNCING / LLM) ---
        if (debounceTimers.has(from)) {
            clearTimeout(debounceTimers.get(from));
        }

        const userBuffer = session.messageBuffer || [];
        userBuffer.push(text);
        session.messageBuffer = userBuffer;
        await sessionManager.saveSession(from, session);

        const newTimer = setTimeout(() => {
            processBufferedMessages(from);
        }, 3500); // Aguarda 3.5 segundos por mais mensagens.

        debounceTimers.set(from, newTimer);

    } catch (error) {
        console.error('❌ Erro fatal no webhook handler:', error);
    }
}

/**
 * Verifica o token do webhook durante a configuração inicial na plataforma da Meta.
 */
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
