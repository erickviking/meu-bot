// bot.js
require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const { MessagingResponse } = require('twilio').twiml;
const twilio = require('twilio');
const fs = require('fs');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// ---- Sessões temporárias por número de telefone -----------------------------
const sessions = new Map();

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      stage: 'start',
      firstName: null,
      askedName: false,
      lastIntent: '',
      lastMessage: '',
      repeatCount: 0,
    });
  }
  return sessions.get(phone);
}

// ---- Configure APIs --------------------------------------------------------
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
const twilioWhatsAppNumber = process.env.TWILIO_WHATSAPP_NUMBER;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Detecção de nome ------------------------------------------------------
function extractFirstName(text) {
  return text.trim().split(' ')[0];
}
function containsFirstNameOnly(text) {
  return text.trim().split(' ').length >= 1;
}

// ---- Registro de perguntas para aprendizado contínuo ------------------------
function logUnresolvedQuestion(phone, message, stage) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    phone,
    stage,
    message,
  };
  fs.appendFileSync('unresolved_questions.log', JSON.stringify(logEntry) + '\n');
}

// ---- Detecção de intenção --------------------------------------------------
async function detectIntent(message) {
  const prompt = `Classifique a intenção principal da mensagem do usuário em uma das seguintes categorias: agendar, valores, sintomas, saudacao, convenio, outra.

Mensagem: "${message}"
Responda APENAS com a palavra da intenção.`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
  });

  return resp.choices[0].message.content.trim();
}

// ---- Geração de Resposta ---------------------------------------------------
async function generateReply(session, from, message) {
  const lower = message.toLowerCase();

  const intent = await detectIntent(message);

  // Verifica repetição por intenção
  if (intent === session.lastIntent) {
    session.repeatCount += 1;
  } else {
    session.repeatCount = 0;
  }
  session.lastIntent = intent;
  session.lastMessage = message;

  // ETAPA 1 – Nome
  if (!session.firstName) {
    if (!session.askedName) {
      session.askedName = true;
      return 'Boa noite! Você entrou em contato com o Consultório do Dr. Quelson, especialista em Gastroenterologia. Com quem eu tenho o prazer de falar?';
    }
    if (containsFirstNameOnly(message)) {
      session.firstName = extractFirstName(message);
      return `Muito bem, ${session.firstName}! Como posso te ajudar hoje? Existe algum sintoma ou preocupação específica que você gostaria de discutir com o Dr. Quelson?`;
    }
  }

  // ETAPA 2 – Convênio
  if (intent === 'convenio') {
    if (session.repeatCount >= 1) {
      return `Claro, ${session.firstName}. O Dr. Quelson realiza atualmente apenas atendimentos particulares. Mas, se puder me contar o que está buscando resolver, posso te explicar como funciona o atendimento aqui — pode te ajudar a decidir se faz sentido seguir conosco.`;
    }
    return `Entendi, ${session.firstName}. Pode me contar um pouco mais sobre o motivo do seu contato com o Dr. Quelson? Assim posso direcionar melhor a sua necessidade.`;
  }

  // ETAPA 3 – Agendamento direto
  if (intent === 'agendar') {
    return `Entendido, ${session.firstName}. Antes de falarmos de datas, posso te explicar como funciona o atendimento aqui? Vai te ajudar a tomar a melhor decisão.`;
  }

  // ETAPA 4 – Sintomas
  if (intent === 'sintomas') {
    return `Certo, ${session.firstName}. É importante avaliarmos isso com cuidado. O Dr. Quelson pode te ajudar. Posso te explicar como funciona o atendimento para você decidir se deseja agendar?`;
  }

  // ETAPA 5 – Saudação ou outra
  if (intent === 'saudacao') {
    return `Olá, ${session.firstName}! Como posso te ajudar hoje?`;
  }

  // ETAPA 6 – Valores
  if (intent === 'valores') {
    return `Certo, ${session.firstName}. Antes de falarmos sobre valores, posso te perguntar: o que exatamente você está buscando resolver com o Dr. Quelson? Assim consigo te orientar melhor.`;
  }

  // Se chegou aqui, não entendeu bem — registrar para aprendizado
  logUnresolvedQuestion(from, message, session.stage);
  return `Entendi, ${session.firstName}. Pode me contar um pouco mais sobre o que você deseja? Assim consigo te ajudar da melhor forma.`;
}

// ---- Webhook de Mensagens (POST) --------------------------------------------
app.post('/webhook', async (req, res) => {
  const twiml = new MessagingResponse();
  const incomingMsg = req.body.Body?.trim() || '';
  const from = req.body.From;

  const session = getSession(from);

  try {
    const reply = await generateReply(session, from, incomingMsg);
    twiml.message(reply);
  } catch (error) {
    console.error('Erro ao gerar resposta:', error);
    twiml.message('Desculpe, houve um erro técnico. Tente novamente mais tarde.');
  }

  res.set('Content-Type', 'text/xml');
  res.send(twiml.toString());
});

// ---- Validação do Webhook pela Meta (GET) -----------------------------------
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado com sucesso!');
    res.status(200).send(challenge);
  } else {
    console.log('❌ Falha na verificação do webhook.');
    res.sendStatus(403);
  }
});

// ---- Inicialização do servidor ----------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot rodando na porta ${PORT}`);
});
