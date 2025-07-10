// src/handlers/webhook.handler.js
const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { getLlmReply, handleInitialMessage } = require('./nepq.handler');
const { simulateTypingDelay } = require('../utils/helpers');
const { isEmergency, getEmergencyResponse } = require('../utils/emergencyDetector');
const { detetarObjeção } = require('./objection.handler');
const { saveMessage } = require('../services/message.service');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);
const debounceTimers = new Map();

async function getProfilePicture(phoneNumberId, accessToken) {
  try {
    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/picture`;
    const response = await axios.get(url, {
      params: { access_token: accessToken },
      responseType: 'arraybuffer'
    });
    return response.request.res.responseUrl || null;
  } catch (error) {
    console.error('[WhatsApp] Erro ao buscar foto de perfil:', error.message);
    return null;
  }
}

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
  if (session.clinicConfig && session.clinicConfig.id && llmResult.reply) {
    const messageToSave = {
      content: llmResult.reply,
      direction: 'outbound',
      patient_phone: from,
      clinic_id: session.clinicConfig.id
    };
    console.log('[Webhook] TENTANDO SALVAR mensagem OUTBOUND:', messageToSave);
    await saveMessage(messageToSave);
  }
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

async function processIncomingMessage(req, res) {
  try {
    const messageData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    const contact = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0];
    const nameFromContact = contact?.profile?.name;
    const phoneNumberId = req.body.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;

    if (!messageData || messageData.type !== 'text' || !messageData.text?.body) {
      return res.sendStatus(200);
    }

    const from = messageData.from;
    const text = messageData.text.body;

    res.sendStatus(200);

    const { data: existingPatient } = await supabase.from('patients').select('name').eq('phone', from).maybeSingle();
    if (!existingPatient || !existingPatient.name) {
      const profilePicUrl = await getProfilePicture(phoneNumberId, config.whatsapp.token);
      console.log(`[Webhook] Salvando paciente novo: ${nameFromContact} (${from})`);
      await supabase.from('patients').upsert({ phone: from, name: nameFromContact || from, profile_picture_url: profilePicUrl }, { onConflict: ['phone'] });
    }

    if (text.toLowerCase() === '/novaconversa') {
      if (debounceTimers.has(from)) clearTimeout(debounceTimers.get(from));
      debounceTimers.delete(from);
      await sessionManager.resetSession(from);
      console.log(`✅ Sessão para ${from} foi resetada.`);
      await whatsappService.sendMessage(from, "Sessão reiniciada. Pode começar uma nova conversa.");
      return;
    }

    const session = await sessionManager.getSession(from);

    if (session.clinicConfig && session.clinicConfig.id) {
      const messageToSave = {
        content: text,
        direction: 'inbound',
        patient_phone: from,
        clinic_id: session.clinicConfig.id
      };
      console.log('[Webhook] TENTANDO SALVAR mensagem INBOUND:', messageToSave);
      await saveMessage(messageToSave);
    }

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
        if (session.clinicConfig && session.clinicConfig.id) {
          const messageToSave = {
            content: objectionResponse,
            direction: 'outbound',
            patient_phone: from,
            clinic_id: session.clinicConfig.id
          };
          console.log('[Webhook] TENTANDO SALVAR mensagem de OBJEÇÃO:', messageToSave);
          await saveMessage(messageToSave);
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
