// src/handlers/nepq.handler.js

const config = require('../config');
const { OpenAI } = require('openai');
const { buildPromptForClinic } = require('../services/promptBuilder');
const calendarService = require('../services/calendar.service');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// =========================
// Helpers de idioma / texto
// =========================
function t(lang, pt, en) {
  return (lang === 'en') ? en : pt;
}

// Detecta se a resposta da IA contém o "fechamento" (PT/EN)
function detectClosing(reply) {
  const text = (reply || '').toLowerCase();

  // Português
  const ptRules = [
    /por isso o atendimento é particular/,
    /o investimento (para|da) (primeira|1ª) consulta/i,
    /valor da consulta/i,
    /podemos seguir com o agendamento\?/i,
  ];

  // Inglês
  const enRules = [
    /that's why the service is private/i,
    /the investment for the first consultation is/i,
    /consultation (fee|price|cost)/i,
    /shall we proceed with the booking\?/i,
  ];

  return ptRules.some(r => r.test(text)) || enRules.some(r => r.test(text));
}

// =========================
// Extração de data/hora p/ calendário (via LLM - JSON)
// =========================
async function extractAppointmentInfo(session, userText) {
  // Retorna { start_iso: string|null, duration_min: number|null }
  const lang = session.lang || 'pt';

  const sys = t(
    lang,
    // PT
    `Você é um extrator de informações de agendamento. 
Retorne apenas JSON com os campos:
- "start_iso": data/hora ISO 8601 (ex: "2025-08-13T15:00:00-03:00") quando possível; caso não haja, use null.
- "duration_min": duração em minutos (número). Se não houver, use 50.
Se a mensagem não contiver data/hora clara, "start_iso" deve ser null.
Considere o fuso horário local da clínica se houver pistas; caso contrário, mantenha em ISO sem timezone.`,
    // EN
    `You are a scheduling info extractor.
Return JSON only with:
- "start_iso": ISO 8601 datetime (e.g., "2025-08-13T15:00:00-03:00") when possible; if missing, use null.
- "duration_min": duration in minutes (number). If missing, use 50.
If the message lacks a clear date/time, "start_iso" must be null.
Consider clinic's local timezone if hinted; otherwise keep ISO without timezone.`
  );

  const user = t(
    lang,
    `Mensagem do paciente: """${userText || ''}"""`,
    `Patient message: """${userText || ''}"""`
  );

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-5-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    });

    const raw = resp.choices?.[0]?.message?.content || '{}';
    const parsed = JSON.parse(raw);
    return {
      start_iso: parsed.start_iso ?? null,
      duration_min: (parsed.duration_min != null ? Number(parsed.duration_min) : 50) || 50,
    };
  } catch (e) {
    console.warn('[extractAppointmentInfo] fallback:', e?.message);
    return { start_iso: null, duration_min: 50 };
  }
}

function calculateEndTime(startISO, durationMinutes = 50) {
  try {
    const start = new Date(startISO);
    if (Number.isNaN(start.getTime())) return null;
    const end = new Date(start.getTime() + (durationMinutes * 60000));
    return end.toISOString();
  } catch {
    return null;
  }
}

// =========================
// LLM principal (resposta ao usuário) + calendário
// =========================
async function getLlmReply(session, latestMessage) {
  const lang = session.lang || 'pt';
  try {
    const baseSystem = buildPromptForClinic(session.clinicConfig, session);

    const languagePolicy = t(
      lang,
      'POLÍTICA DE IDIOMA: Responda em português do Brasil, claro e natural. Se o usuário mudar de idioma, espelhe o idioma dele.',
      'LANGUAGE POLICY: Answer in natural, clear English. If the user switches language, mirror their language.'
    );

    const messages = [
      { role: 'system', content: `${baseSystem}\n\n${languagePolicy}` },
      ...(session.conversationHistory || []),
      { role: 'user', content: latestMessage }
    ];

    const response = await openai.chat.completions.create({
      model: 'gpt-5-chat-latest',
      messages,
      temperature: 0.6,
      max_tokens: 700,
    });

    const botReply = response.choices?.[0]?.message?.content ?? '';

    // Atualiza histórico curto (janela)
    session.conversationHistory = [
      ...(session.conversationHistory || []),
      { role: 'user', content: latestMessage },
      { role: 'assistant', content: botReply },
    ].slice(-12);

    // 1) Fechamento detectado → troca de estado
    if (detectClosing(botReply) && session.state === 'nepq_discovery') {
      console.log(`[FSM] Closing detected → 'closing_delivered'`);
      return { reply: botReply, newState: 'closing_delivered' };
    }

    // 2) Agendamento confirmado → criar evento no Google Calendar
    // Detecção simples (bilíngue)
    const lower = botReply.toLowerCase();
    const bookingDetected =
      lower.includes('consulta confirmada') ||
      lower.includes('agendamento confirmado') ||
      lower.includes('agendada com sucesso') ||
      lower.includes('appointment confirmed') ||
      lower.includes('successfully scheduled');

    if (bookingDetected) {
      console.log(`[FSM] Booking confirmed by AI → creating Google Calendar event`);
      const clinicCalendarId = session?.clinicConfig?.google_calendar_id;

      if (clinicCalendarId) {
        // Tenta extrair data/hora a partir das mensagens recentes (usuário e/ou resposta)
        const refText = [latestMessage, botReply].filter(Boolean).join('\n---\n');
        const { start_iso, duration_min } = await extractAppointmentInfo(session, refText);

        if (start_iso) {
          const endISO = calculateEndTime(start_iso, duration_min || 50);
          try {
            await calendarService.createEvent(clinicCalendarId, {
              summary: t(lang, `Consulta - ${session.firstName || ''}`, `Consultation - ${session.firstName || ''}`),
              description: t(
                lang,
                `Agendamento via assistente virtual para ${session.firstName || ''}.\nTelefone: ${session.from || ''}`,
                `Booking via virtual assistant for ${session.firstName || ''}.\nPhone: ${session.from || ''}`
              ),
              startDateTime: start_iso,
              endDateTime: endISO || start_iso,
            });
          } catch (e) {
            console.warn('[Calendar] createEvent failed:', e?.message);
          }
        } else {
          console.warn('[Calendar] No start_iso extracted; skipping event creation.');
        }
      } else {
        console.warn(`[Calendar] Clinic without google_calendar_id.`);
      }

      return { reply: botReply, newState: 'booked' };
    }

    return { reply: botReply, newState: session.state };
  } catch (error) {
    console.error('🚨 Error in OpenAI API call:', error);
    return {
      reply: t(
        lang,
        `Desculpe, ${session.firstName || 'amigo(a)'}, estou com uma indisponibilidade técnica agora.`,
        `Sorry, ${session.firstName || 'friend'}, I am experiencing a technical issue right now.`
      ),
      newState: session.state,
    };
  }
}

// =========================
// Onboarding (extração de nome) – bilíngue
// =========================
async function handleInitialMessage(session, message, clinicConfig) {
  const lang = session.lang || 'pt';
  const currentState = session.onboardingState;
  const doctorName = clinicConfig.doctorName || t(lang, 'nosso especialista', 'our specialist');
  const secretaryName = clinicConfig.secretaryName || t(lang, 'a assistente virtual', 'the virtual assistant');

  if (currentState === 'start') {
    session.onboardingState = 'awaiting_name';
    return t(
      lang,
      `Olá! Bem-vindo(a) ao consultório do Dr. ${doctorName}. Eu sou ${secretaryName}. Qual é o seu nome, por favor?`,
      `Hello! Welcome to Dr. ${doctorName}'s office. I am ${secretaryName}. What is your name, please?`
    );
  }

  if (currentState === 'awaiting_name') {
    console.log(`[AI Onboarding] Extracting first name from: "${message}"`);

    const sys = t(
      lang,
      `Extraia o primeiro nome do usuário a partir da frase. 
Responda APENAS com JSON válido no formato:
{ "extracted_name": "Nome" }
Se não houver nome claro, use null.`,
      `Extract the user's first name from the sentence.
Reply ONLY with valid JSON:
{ "extracted_name": "Name" }
If no clear name, use null.`
    );

    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: message || '' },
        ],
      });

      const json = resp.choices?.[0]?.message?.content || '{}';
      const result = JSON.parse(json);
      const potentialName = (result.extracted_name || '').trim();

      if (!potentialName || potentialName.length < 2) {
        return t(
          lang,
          `Desculpe, não consegui identificar seu nome. Pode me dizer somente como devo te chamar?`,
          `Sorry, I couldn't identify your name. Could you please tell me just what I should call you?`
        );
      }

      const first = potentialName.split(/\s+/)[0];
      const formatted = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();

      session.firstName = formatted;
      session.onboardingState = 'complete';
      session.state = 'nepq_discovery';

      const welcome = t(
        lang,
        `Perfeito, ${formatted}! É um prazer falar com você. Para te ajudar melhor, pode me contar o que te trouxe ao Dr. ${doctorName} hoje?`,
        `Perfect, ${formatted}! It's a pleasure to speak with you. To best assist you, could you tell me what brought you to see Dr. ${doctorName} today?`
      );

      session.conversationHistory = [
        { role: 'user', content: t(lang, `O paciente se apresentou como ${formatted}.`, `The patient introduced themselves as ${formatted}.`) },
        { role: 'assistant', content: welcome }
      ];

      return welcome;
    } catch (e) {
      console.error('[Onboarding] name extraction failed:', e);
      return t(
        lang,
        `Desculpe, estou com dificuldade técnica para entender sua resposta. Pode repetir seu nome?`,
        `Sorry, I'm having a technical difficulty understanding your response. Could you please repeat your name?`
      );
    }
  }

  return null;
}

module.exports = { getLlmReply, handleInitialMessage };

