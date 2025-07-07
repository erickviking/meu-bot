// src/handlers/webhook.handler.js
const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { getLlmReply, handleInitialMessage } = require('./nepq.handler');
const { simulateTypingDelay } = require('../utils/helpers');
const { isEmergency, getEmergencyResponse } = require('../utils/emergencyDetector');
const { detetarObjeção } = require('./objection.handler');
const { saveMessage } = require('../services/message.service'); // <<< 1. ADICIONE ESTA IMPORTAÇÃO

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
    
    session.messageBuffer = [];
    
    const llmResult = await getLlmReply(session, fullMessage);
    
    // <<< 2. INÍCIO DA MODIFICAÇÃO: Salvar a resposta do bot (outbound) >>>
    // Fazemos isso aqui, logo após receber a resposta da IA.
    if (session.clinicConfig && session.clinicConfig.id && llmResult.reply) {
        await saveMessage({
            content: llmResult.reply,
            direction: 'outbound',
            patient_phone: from,
            clinic_id: session.clinicConfig.id
        });
    }
    // <<< FIM DA MODIFICAÇÃO >>>

    if (llmResult.newState && llmResult.newState !== session.state) {
        session.state = llmResult.newState;
    }
    
    await sessionManager.saveSession(from, session);
    
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

        res.sendStatus(200);

        if (text.toLowerCase() === '/novaconversa') {
            if (debounceTimers.has(from)) clearTimeout(debounceTimers.get(from));
            debounceTimers.delete(from);
            await sessionManager.resetSession(from);
            console.log(`✅ Sessão para ${from} foi resetada.`);
            await whatsappService.sendMessage(from, "Sessão reiniciada. Pode começar uma nova conversa.");
            return;
        }

        const session = await sessionManager.getSession(from);

        // <<< 3. INÍCIO DA MODIFICAÇÃO: Salvar a mensagem do paciente (inbound) >>>
        // Fazemos isso aqui, logo no início, para registrar tudo que chega.
        if (session.clinicConfig && session.clinicConfig.id) {
            await saveMessage({
                content: text,
                direction: 'inbound',
                patient_phone: from,
                clinic_id: session.clinicConfig.id
            });
        }
        // <<< FIM DA MODIFICAÇÃO >>>

        if (isEmergency(text)) {
            console.log(`🚨 [Guardrail] Emergência detectada para ${from}.`);
            const emergencyResponse = getEmergencyResponse(session.firstName);
            await whatsappService.sendMessage(from, emergencyResponse);
            return;
        }
        
        if (session.onboardingState !== 'complete') {
            const onboardingResponse = handleInitialMessage(session, text, session.clinicConfig);
            if (onboardingResponse) {
                await sessionManager.saveSession(from, session);
                await simulateTypingDelay(onboardingResponse);
                await whatsappService.sendMessage(from, onboardingResponse);
                return;
            }
        }

        if (session.state === 'closing_delivered') {
            console.log(`[FSM] Estado 'closing_delivered'. Verificando objeções para: "${text}"`);
            const objectionResponse = detetarObjeção(text, session.firstName);
            if (objectionResponse) {
                console.log(`💡 [Guardrail] Objeção pós-fechamento detectada.`);
                // Salva a resposta da objeção também!
                if (session.clinicConfig && session.clinicConfig.id) {
                    await saveMessage({ content: objectionResponse, direction: 'outbound', patient_phone: from, clinic_id: session.clinicConfig.id });
                }
                await simulateTypingDelay(objectionResponse);
                await whatsappService.sendMessage(from, objectionResponse);
                return;
            }
        }

        console.log(`[FSM] Mensagem de ${from} no estado '${session.state}' segue para a IA.`);

        if (debounceTimers.has(from)) {
            clearTimeout(debounceTimers.get(from));
        }

        const userBuffer = session.messageBuffer || [];
        userBuffer.push(text);
        session.messageBuffer = userBuffer;
        await sessionManager.saveSession(from, session);

        const newTimer = setTimeout(() => {
            processBufferedMessages(from);
        }, 3500);

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
