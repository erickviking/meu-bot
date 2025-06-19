// bot.js
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');

// Importação correta do fetch para Node.js
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

const fs = require('fs');

const app = express();
app.use(bodyParser.json()); // Meta envia mensagens como JSON

// ---- Sessões por número de telefone -----------------------------------------
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

// ---- Configuração da OpenAI -------------------------------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Funções auxiliares -----------------------------------------------------
function extractFirstName(text) {
  return text.trim().split(' ')[0];
}
function containsFirstNameOnly(text) {
  return text.trim().split(' ').length >= 1;
}
function logUnresolvedQuestion(phone, message, stage) {
  const log = {
    timestamp: new Date().toISOString(),
    phone,
    stage,
    message,
  };
  fs.appendFileSync('unresolved_questions.log', JSON.stringify(log) + '\n');
}

// ---- Classificador de intenção ----------------------------------------------
async function detectIntent(message) {
  const prompt = `Classifique a intenção principal da mensagem do usuário em uma das seguintes categorias: agendar, valores, sintomas, saudacao, convenio, outra.

Mensagem: "${message}"
Responda APENAS com a palavra da intenção.`;

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: prompt }],
  });

  return resp.choices[0].message.content.trim().toLowerCase();
}

// ---- Geração de resposta ----------------------------------------------------
async function generateReply(session, from, message) {
  const intent = await detectIntent(message);

  if (intent === session.lastIntent) {
    session.repeatCount += 1;
  } else {
    session.repeatCount = 0;
  }
  session.lastIntent = intent;
  session.lastMessage = message;

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

  switch (intent) {
    case 'convenio':
      if (session.repeatCount >= 1) {
        return `Claro, ${session.firstName}. O Dr. Quelson realiza atualmente apenas atendimentos particulares. Mas, se puder me contar o que está buscando resolver, posso te explicar como funciona o atendimento aqui — pode te ajudar a decidir se faz sentido seguir conosco.`;
      }
      return `Entendi, ${session.firstName}. Pode me contar um pouco mais sobre o motivo do seu contato com o Dr. Quelson? Assim posso direcionar melhor a sua necessidade.`;

    case 'agendar':
      return `Entendido, ${session.firstName}. Antes de falarmos de datas, posso te explicar como funciona o atendimento aqui? Vai te ajudar a tomar a melhor decisão.`;

    case 'sintomas':
      return `Certo, ${session.firstName}. É importante avaliarmos isso com cuidado. O Dr. Quelson pode te ajudar. Posso te explicar como funciona o atendimento para você decidir se deseja agendar?`;

    case 'saudacao':
      return `Olá, ${session.firstName}! Como posso te ajudar hoje?`;

    case 'valores':
      return `Certo, ${session.firstName}. Antes de falarmos sobre valores, posso te perguntar: o que exatamente você está buscando resolver com o Dr. Quelson? Assim consigo te orientar melhor.`;

    default:
      logUnresolvedQuestion(from, message, session.stage);
      return `Entendi, ${session.firstName}. Pode me contar um pouco mais sobre o que você deseja? Assim consigo te ajudar da melhor forma.`;
  }
}

// ---- Webhook de mensagens (POST) --------------------------------------------
app.post('/webhook', async (req, res) => {
  try {
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const messageData = changes?.value?.messages?.[0];

    if (!messageData || !messageData.text?.body) {
      console.log('Mensagem ignorada (não é de texto ou vazia).');
      return res.sendStatus(200);
    }

    const from = messageData.from;
    const text = messageData.text.body;

    const session = getSession(from);
    const reply = await generateReply(session, from, text);

    await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: from,
        text: { body: reply },
      }),
    });

    res.sendStatus(200);
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
    res.sendStatus(500);
  }
});

// ---- Validação do Webhook (GET) ---------------------------------------------
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado com sucesso!');
    return res.status(200).send(challenge);
  } else {
    console.log('❌ Falha na verificação do Webhook.');
    return res.sendStatus(403);
  }
});

// ---- Inicialização -----------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot rodando na porta ${PORT}`);
});
