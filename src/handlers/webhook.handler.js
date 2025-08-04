// src/handlers/webhook.handler.js
const config = require('../config');
const sessionManager = require('../services/sessionManager');
const whatsappService = require('../services/whatsappService');
const { transcribeAudio } = require('../services/transcription.service');
const { getLlmReply, handleInitialMessage } = require('./nepq.handler');
const { simulateTypingDelay } = require('../utils/helpers');
const { isEmergency, getEmergencyResponse } = require('../utils/emergencyDetector');
const { detetarObjeção } = require('./objection.handler');
const { saveMessage, clearConversationHistory } = require('../services/message.service');
const { generateAndSaveSummary } = require('../services/summary.service');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);

const debounceTimers = new Map();
const summaryTimers = new Map();

const SUMMARY_INACTIVITY_TIMEOUT = 60 * 60 * 1000; // 1 hora
const AUTO_REACTIVATE_AI_MINUTES = 15; // 15 minutos

async function getProfilePicture(phoneNumberId, accessToken) {
  try {
    const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/picture`;
    const response = await axios.get(url, {
      params: { access_token: accessToken },
      responseType: 'arraybuffer',
    });
    return response.request.res.responseUrl || null;
  } catch (error) {
    console.error('[WhatsApp] Erro ao buscar foto de perfil:', error.message);
    return null;
  }
}

async function sendMultiPartMessage(to, fullText) {
  if (!fullText) return;
  const paragraphs = fullText.split('\n\n').filter((p) => p.trim().length > 0);
  for (const paragraph of paragraphs) {
    await whatsappService.sendMessage(to, paragraph);
    if (paragraphs.length > 1) {
      const interMessageDelay = 1500 + Math.random() * 1000;
      await new Promise((resolve) => setTimeout(resolve, interMessageDelay));
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

  if (session.clinicConfig?.id && llmResult.reply) {
    await saveMessage({
      content: llmResult.reply,
      direction: 'outbound',
      sender: 'ai', // 🔹 Identifica como mensagem da IA
      patient_phone: from,
      clinic_id: session.clinicConfig.id,
    });
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

    // Aceita text, audio e voice
    const validTypes = ['text', 'audio', 'voice'];
    if (!messageData || !validTypes.includes(messageData.type)) {
      return res.sendStatus(200);
    }

    const from = messageData.from;
    let text = '';

    // --- Tratamento de áudio ---
    if (messageData.type === 'audio' || messageData.type === 'voice') {
      console.log(`[Webhook] Áudio recebido de ${from}:`, JSON.stringify(messageData, null, 2));
      const mediaId = messageData.audio?.id || messageData.voice?.id;

      if (!mediaId) {
        console.warn(`[Webhook] Mensagem de áudio recebida de ${from}, mas sem mediaId.`);
        return res.sendStatus(200);
      }

      const audioBuffer = await whatsappService.downloadMedia(mediaId);
      if (!audioBuffer || !audioBuffer.length) {
        console.warn(`[Webhook] Erro ao baixar áudio de ${from}. Buffer vazio.`);
        return res.sendStatus(200);
      }

      console.log(`[Transcribe] Recebido áudio de ${from}, tamanho: ${audioBuffer.length} bytes`);
      text = await transcribeAudio(audioBuffer);
      if (!text) {
        console.warn(`[Webhook] Transcrição vazia para áudio de ${from}`);
      }
    }

    if (messageData.type === 'text') {
      text = messageData.text?.body || '';
    }

    if (!text) return res.sendStatus(200);

    res.sendStatus(200);

    // Resetar timer de resumo
    if (summaryTimers.has(from)) {
      clearTimeout(summaryTimers.get(from));
      console.log(`[Auto-Summary] Timer de inatividade para ${from} foi resetado.`);
    }

    // Criar/atualizar paciente
    const { data: existingPatient } = await supabase
      .from('patients')
      .select('name')
      .eq('phone', from)
      .maybeSingle();

    if (!existingPatient || !existingPatient.name) {
      const profilePicUrl = await getProfilePicture(phoneNumberId, config.whatsapp.token);
      await supabase.from('patients').upsert(
        { phone: from, name: nameFromContact || from, profile_picture_url: profilePicUrl },
        { onConflict: ['phone'] }
      );
    }

    const session = await sessionManager.getSession(from);

    // --- VERIFICAÇÃO DE IA E AUTO-REACTIVAÇÃO ---
    const { data: patient } = await supabase
      .from('patients')
      .select('is_ai_active, last_manual_message_at')
      .eq('phone', from)
      .single();

    let aiActive = patient?.is_ai_active ?? true;

    if (!aiActive && patient?.last_manual_message_at) {
      const lastManual = new Date(patient.last_manual_message_at);
      const diffMinutes = (Date.now() - lastManual.getTime()) / 1000 / 60;

      if (diffMinutes >= AUTO_REACTIVATE_AI_MINUTES) {
        console.log(`[Webhook] IA reativada automaticamente para ${from} após ${AUTO_REACTIVATE_AI_MINUTES} min.`);
        aiActive = true;
        await supabase.from('patients').update({ is_ai_active: true }).eq('phone', from);
      }
    }

    // Se IA estiver inativa, só salva a mensagem e sai
    if (!aiActive) {
      console.log(`[Webhook] IA pausada para ${from}. Apenas salvando a mensagem.`);
      if (session.clinicConfig?.id) {
        await saveMessage({
          content: text,
          direction: 'inbound',
          sender: 'patient',
          patient_phone: from,
          clinic_id: session.clinicConfig.id,
        });
      }
      return;
    }

    // --- Comando especial ---
    if (text.toLowerCase() === '/novaconversa') {
      if (debounceTimers.has(from)) clearTimeout(debounceTimers.get(from));
      debounceTimers.delete(from);
      if (summaryTimers.has(from)) clearTimeout(summaryTimers.get(from));
      summaryTimers.delete(from);

      if (session.clinicConfig?.id) {
        await clearConversationHistory(from, session.clinicConfig.id);
      }

      await sessionManager.resetSession(from);
      await whatsappService.sendMessage(from, 'Sessão e histórico reiniciados. Pode começar uma nova conversa.');
      return;
    }

    // Salvar mensagem inbound
    if (session.clinicConfig?.id) {
      await saveMessage({
        content: text,
        direction: 'inbound',
        sender: 'patient',
        patient_phone: from,
        clinic_id: session.clinicConfig.id,
      });
    }

    // --- Emergências ---
    if (isEmergency(text)) {
      const emergencyResponse = getEmergencyResponse(session.firstName);
      await whatsappService.sendMessage(from, emergencyResponse);
      return;
    }

    // --- Onboarding ---
    if (session.onboardingState !== 'complete') {
      const onboardingResponse = await handleInitialMessage(session, text, session.clinicConfig);
      if (onboardingResponse) {
        await sessionManager.saveSession(from, session);
        await simulateTypingDelay(onboardingResponse);
        await whatsappService.sendMessage(from, onboardingResponse);

        if (session.clinicConfig?.id) {
          await saveMessage({
            content: onboardingResponse,
            direction: 'outbound',
            sender: 'ai', // 🔹 IA não pausa IA
            patient_phone: from,
            clinic_id: session.clinicConfig.id,
          });
        }
        return;
      }
    }

    // --- Objeções ---
    if (session.state === 'closing_delivered') {
      const objectionResponse = detetarObjeção(text, session.firstName);
      if (objectionResponse) {
        if (session.clinicConfig?.id) {
          await saveMessage({
            content: objectionResponse,
            direction: 'outbound',
            sender: 'ai',
            patient_phone: from,
            clinic_id: session.clinicConfig.id,
          });
        }
        await simulateTypingDelay(objectionResponse);
        await whatsappService.sendMessage(from, objectionResponse);
        return;
      }
    }

    // --- Debounce de mensagens ---
    if (debounceTimers.has(from)) clearTimeout(debounceTimers.get(from));
    const userBuffer = session.messageBuffer || [];
    userBuffer.push(text);
    session.messageBuffer = userBuffer;
    await sessionManager.saveSession(from, session);

    const newDebounceTimer = setTimeout(() => {
      processBufferedMessages(from);
    }, 3500);
    debounceTimers.set(from, newDebounceTimer);

    // --- Timer de resumo ---
    if (session.clinicConfig?.id) {
      const newSummaryTimer = setTimeout(() => {
        console.log(`[Auto-Summary] Inatividade de 1h detectada para ${from}. Gerando resumo...`);
        generateAndSaveSummary(from, session.clinicConfig.id);
        summaryTimers.delete(from);
      }, SUMMARY_INACTIVITY_TIMEOUT);
      summaryTimers.set(from, newSummaryTimer);
    }
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
