// bot.js
require('dotenv').config(); 

const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const { MessagingResponse } = require('twilio').twiml;
const twilio = require('twilio');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));

// ---- Sessões temporárias por número de telefone -----------------------------
const sessions = new Map();

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      stage: 'start',
      firstName: null,
      fullName: null,
      askedName: false,
      lastQuestion: null,
      objectionHandled: false,
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
function looksLikeFullName(text) {
  return text.trim().split(' ').length >= 2;
}
function containsFirstNameOnly(text) {
  return text.trim().split(' ').length === 1;
}

// ---- Prompt principal ------------------------------------------------------
async function generateReply(session, message) {
  const lower = message.toLowerCase();

  // ETAPA 1 – Nome
  if (!session.fullName) {
    if (!session.askedName) {
      session.askedName = true;
      return 'Boa noite! Você entrou em contato com o Consultório do Dr. Quelson, especialista em Gastroenterologia. Com quem eu tenho o prazer de falar?';
    }

    if (looksLikeFullName(message)) {
      session.fullName = message.trim();
      session.firstName = extractFirstName(message);
      return `Muito bem, ${session.firstName}! Como posso te ajudar hoje? Existe algum sintoma ou preocupação específica que você gostaria de discutir com o Dr. Quelson?`;
    }

    if (containsFirstNameOnly(message)) {
      session.firstName = message.trim();
      return `Olá, ${session.firstName}! Você pode me dizer seu nome completo, por gentileza?`;
    }
  }

  // Demais etapas do NEPQ entrariam aqui...
  return `Entendi, ${session.firstName || ''}. Pode me contar um pouco mais sobre o motivo do seu contato com o Dr. Quelson? Assim posso direcionar melhor a sua necessidade.`;
}

// ---- Rota Webhook ----------------------------------------------------------
app.post('/webhook', async (req, res) => {
  const twiml = new MessagingResponse();
  const incomingMsg = req.body.Body?.trim() || '';
  const from = req.body.From;

  const session = getSession(from);

  try {
    const reply = await generateReply(session, incomingMsg);
    twiml.message(reply);
  } catch (error) {
    console.error('Erro ao gerar resposta:', error);
    twiml.message('Desculpe, houve um erro técnico. Tente novamente mais tarde.');
  }

  res.set('Content-Type', 'text/xml');
  res.send(twiml.toString());
});

// ---- Inicialização do servidor -------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot rodando na porta ${PORT}`);
});
