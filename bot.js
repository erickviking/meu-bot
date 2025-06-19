// bot.js - Secretária NEPQ Humanizada
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs');

const app = express();
app.use(bodyParser.json());

// ---- Sessões com fluxo NEPQ humanizado ----------------------------------
const sessions = new Map();

function getSession(phone) {
  if (!sessions.has(phone)) {
    sessions.set(phone, {
      stage: 'start', 
      firstName: null,
      askedName: false,
      lastIntent: '',
      problemContext: null,
      duration: null,
      worsening: null,
      triedSolutions: null,
      impact: null,
      desiredOutcome: null,
      repeatCount: 0,
      conversationData: {} // Para armazenar contexto da conversa
    });
  }
  return sessions.get(phone);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Funções auxiliares -----------------------------------------------------
function extractFirstName(text) {
  const cleaned = text.trim().toLowerCase();
  
  const patterns = [
    /(?:aqui (?:é|eh) |sou (?:a |o )?|me chamo |meu nome (?:é|eh) )(.+)/,
    /(?:é|eh) (?:a |o )?(.+)/,
    /^(.+)$/
  ];
  
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      const name = match[1].trim().split(' ')[0];
      return name.charAt(0).toUpperCase() + name.slice(1);
    }
  }
  
  return text.trim().split(' ')[0];
}

function containsFirstNameOnly(text) {
  const cleaned = text.trim().toLowerCase();
  
  const namePatterns = [
    /(?:aqui (?:é|eh) |sou (?:a |o )?|me chamo |meu nome (?:é|eh) )/,
    /^[a-záàãâéêíóôõúç\s]+$/i
  ];
  
  if (namePatterns.some(pattern => pattern.test(cleaned))) {
    return true;
  }
  
  if (cleaned.length < 2 || /\d|[!@#$%^&*()_+=\[\]{}|;':",./<>?]/.test(cleaned)) {
    return false;
  }
  
  return true;
}

// ---- Classificador de intenção humanizado ----------------------------------
async function detectIntent(message, stage) {
  const prompt = `Analise a mensagem do usuário considerando o estágio "${stage}" da conversa médica.

ESTÁGIOS:
- start: início da conversa
- situacao: entendendo o contexto do problema  
- problema: explorando detalhes da dor/desconforto
- implicacao: analisando impactos na vida
- solucao: visualizando melhora
- fechamento: conduzindo para agendamento

CATEGORIAS:
- agendar: quer marcar consulta diretamente
- valores: pergunta sobre preço, valor, quanto custa
- sintomas: descreve problemas de saúde, dores, desconfortos
- duracao: menciona tempo que sente o problema
- tentativas: fala de tratamentos já tentados, médicos consultados
- impacto: como afeta sua vida, rotina, trabalho, sono
- desejo_melhora: como gostaria de se sentir, vida sem o problema
- convenio: pergunta sobre planos de saúde
- horarios: quer saber horários de funcionamento
- positiva: concorda, quer continuar, resposta afirmativa
- negativa: resiste, não quer, resposta negativa
- saudacao: cumprimentos, tchau
- urgencia: menciona urgência, pressa, emergência
- outra: outras respostas

Mensagem: "${message}"
Estágio atual: "${stage}"

Responda APENAS com a categoria mais apropriada.`;

  try {
    const resp = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 15,
      temperature: 0.1,
    });

    return resp.choices[0].message.content.trim().toLowerCase();
  } catch (error) {
    console.error('Erro na OpenAI:', error);
    return 'outra';
  }
}

// ---- Respostas variadas para naturalidade -----------------------------------
function getRandomResponse(responses) {
  return responses[Math.floor(Math.random() * responses.length)];
}

// ---- Geração de resposta com NEPQ humanizado --------------------------------
async function generateReply(session, from, message) {
  const intent = await detectIntent(message, session.stage);

  // Captura de nome com saudação calorosa
  if (!session.firstName) {
    if (!session.askedName) {
      session.askedName = true;
      const saudacoes = [
        'Boa noite! Você entrou em contato com o Consultório do Dr. Quelson, especialista em Gastroenterologia. Com quem eu tenho o prazer de falar? 😊',
        'Olá! Aqui é do consultório do Dr. Quelson. É um prazer falar com você! Qual seu nome?',
        'Oi! Você está falando com a secretária do Dr. Quelson. Como posso te chamar?'
      ];
      return getRandomResponse(saudacoes);
    }
    
    if (containsFirstNameOnly(message)) {
      session.firstName = extractFirstName(message);
      session.stage = 'situacao';
      
      const situacaoResponses = [
        `Oi, ${session.firstName}! Tudo bem? Antes de te passar os horários, posso entender um pouco do que está acontecendo com você? Assim consigo te orientar melhor 🧡`,
        `É um prazer falar com você, ${session.firstName}! 😊 Só pra eu te ajudar da melhor forma, posso te perguntar rapidinho o que está te incomodando? 🙏`,
        `Seja bem-vindo(a), ${session.firstName}! Antes de marcar, queria te escutar um pouquinho... Pode me contar o que tem te preocupado? Às vezes só isso já alivia 💬`
      ];
      return getRandomResponse(situacaoResponses);
    } else {
      return 'Desculpe, não consegui entender seu nome. Pode me dizer apenas seu primeiro nome, por favor?';
    }
  }

  // Fluxo NEPQ humanizado baseado no estágio
  switch (session.stage) {
    case 'situacao':
      // 🟢 SITUAÇÃO - Entendendo o contexto com empatia
      if (intent === 'agendar') {
        session.stage = 'problema';
        session.problemContext = 'agendamento_direto';
        return `Entendo, ${session.firstName}. Só para eu te orientar melhor e preparar o Dr. Quelson para te atender bem, pode me contar rapidinho o que está te incomodando? 🙏`;
      }
      
      if (intent === 'valores') {
        return `${session.firstName}, vou te falar sobre os valores sim! Mas antes, me ajuda com uma coisa? O que exatamente está te preocupando? Assim posso te explicar direitinho como o Dr. Quelson pode te ajudar 😊`;
      }
      
      if (intent === 'sintomas') {
        session.stage = 'problema';
        session.problemContext = message;
        const problemResponses = [
          `Nossa, ${session.firstName}... deve ser bem difícil mesmo 😔 E isso tem te incomodado mais em qual parte do dia? De manhã, à noite...?`,
          `Poxa, ${session.firstName}, entendo... Há quanto tempo está assim?`,
          `Nossa, ${session.firstName}... Deve ser bem preocupante. Me conta, há quanto tempo você sente isso?`
        ];
        return getRandomResponse(problemResponses);
      }
      
      if (intent === 'urgencia') {
        session.stage = 'problema';
        return `${session.firstName}, entendo sua urgência. Para eu conseguir o melhor horário para você, pode me contar rapidinho o que está acontecendo?`;
      }
      
      return `${session.firstName}, pode me contar um pouquinho do que está te incomodando? Como posso te ajudar melhor com isso que você está sentindo? 💬`;

    case 'problema':
      // 🔴 PROBLEMA - Criando consciência da dor
      if (intent === 'duracao' || intent === 'sintomas') {
        if (!session.duration) {
          session.duration = message;
          const worseningQuestions = [
            `E isso tem piorado com o tempo ou mantém do mesmo jeito, ${session.firstName}?`,
            `Já aconteceu de isso atrapalhar algum momento importante seu? Algum evento, trabalho, sono...?`,
            `Você sente que tem ficado mais intenso ultimamente?`
          ];
          return getRandomResponse(worseningQuestions);
        }
        
        if (!session.worsening) {
          session.worsening = message;
          const solutionQuestions = [
            `Você já passou com algum médico por isso antes? Sentiu que te ajudaram de verdade?`,
            `Já tentou algum tratamento ou medicação para isso?`,
            `E você já tentou resolver de alguma forma? Algum tratamento, medicação ou mudança na alimentação?`
          ];
          return getRandomResponse(solutionQuestions);
        }
        
        if (!session.triedSolutions) {
          session.triedSolutions = message;
          session.stage = 'implicacao';
          const implicationStarters = [
            `Entendo, ${session.firstName}... Você sente que isso tem afetado sua rotina?`,
            `Puxa, ${session.firstName}... E isso já atrapalhou seu sono ou alimentação?`,
            `Nossa... Já parou pra pensar no quanto isso te desgasta emocionalmente? 😞`
          ];
          return getRandomResponse(implicationStarters);
        }
      }
      
      const problemQuestions = [
        `${session.firstName}, me conta: há quanto tempo você sente isso?`,
        `E isso tem te incomodado mais em qual parte do dia, ${session.firstName}?`,
        `Nossa, ${session.firstName}... deve ser bem difícil mesmo 😔 Há quanto tempo está assim?`
      ];
      return getRandomResponse(problemQuestions);

    case 'implicacao':
      // 🟠 IMPLICAÇÃO - Aumentando a urgência com cuidado
      if (intent === 'impacto' || intent === 'positiva') {
        if (!session.impact) {
          session.impact = message;
          session.stage = 'solucao';
          const futureQuestions = [
            `${session.firstName}, se isso continuar mais algumas semanas ou meses... como imagina que vai estar sua vida?`,
            `O que mais te preocupa nisso tudo hoje, ${session.firstName}?`,
            `Tem algo que você sente que está deixando de viver por causa disso?`
          ];
          return getRandomResponse(futureQuestions);
        }
      }
      
      const implicationQuestions = [
        `E se eu te perguntasse: isso já está afetando seu dia a dia? Sua alimentação, sono, ou sua tranquilidade em geral?`,
        `Você sente que isso tem afetado sua rotina, ${session.firstName}?`,
        `Já parou pra pensar no quanto isso te desgasta emocionalmente? 😞`
      ];
      return getRandomResponse(implicationQuestions);

    case 'solucao':
      // 🟡 SOLUÇÃO - Fazendo visualizar a melhora
      if (intent === 'desejo_melhora' || intent === 'positiva') {
        session.desiredOutcome = message;
        session.stage = 'fechamento';
        const visualizationResponses = [
          `${session.firstName}, imagina só se isso já estivesse resolvido... o que você faria diferente no seu dia? 🌞`,
          `E se você começasse a melhorar em algumas semanas... qual seria a primeira coisa que você iria comemorar? ✨`,
          `Como seria sua vida se esse problema não existisse mais, ${session.firstName}? ✨`
        ];
        return getRandomResponse(visualizationResponses);
      }
      
      const solutionQuestions = [
        `${session.firstName}, imagina só se isso já estivesse resolvido... o que você faria diferente no seu dia? 🌞`,
        `E se você tivesse um plano claro pra resolver isso, montado por alguém que realmente te escuta... o quanto isso te traria mais paz?`,
        `Como seria sua vida se esse problema não existisse mais? ✨`
      ];
      return getRandomResponse(solutionQuestions);

    case 'fechamento':
      // 🟣 FECHAMENTO - Conduzindo com autoridade e prova social
      if (intent === 'agendar' || intent === 'positiva' || intent === 'horarios') {
        const agendamentoResponses = [
          `Entendi, ${session.firstName}. E olha, o Dr. Quelson tem atendido muitas pessoas com esse mesmo tipo de sintoma. O que elas mais dizem quando saem da consulta é que, pela primeira vez, sentiram que alguém realmente parou pra escutar, investigar a fundo e explicar com clareza o que está acontecendo — sem pressa, sem superficialidade.

Te falo isso porque tem muito paciente que já passou por 2, 3 médicos do plano, tomou vários remédios, mas o problema sempre volta… e quando chegam aqui, descobrem que estavam tratando o efeito, não a causa.

A consulta é R$ 400,00 e dura 60 minutos. O Dr. Quelson atende de segunda a sexta, das 8h às 18h, e sábados pela manhã. 

Você gostaria de agendar ainda essa semana para já começar esse processo? 📅`,

          `${session.firstName}, que bom que você está buscando ajuda agora — porque quanto mais cedo você entende o que está acontecendo, mais fácil é tratar de forma certa.

O Dr. Quelson é especialista em gastroenterologia, e ele costuma ser o primeiro médico que muitos pacientes procuram justamente por isso: ele escuta com calma, investiga a fundo e já começa com um plano claro, sem perder tempo com tentativa e erro.

A consulta é R$ 400,00, 60 minutos onde ele realmente te escuta. Quem passa com ele geralmente diz que sai mais tranquilo por entender de verdade o que está acontecendo.

Posso ver aqui o melhor horário para você... Pode ser essa semana ainda? 📅`
        ];
        return getRandomResponse(agendamentoResponses);
      }
      
      if (intent === 'valores') {
        return `${session.firstName}, a consulta é R$ 400,00, e olha... vale cada centavo. É uma consulta de 60 minutos onde o Dr. Quelson realmente te escuta e investiga a fundo. Muitos pacientes já me disseram: "Se soubesse que era assim, teria vindo muito antes".

O que o Dr. faz é ir direto na raiz do problema e montar um plano específico pro seu caso. Isso acaba evitando meses de sofrimento e tentativas que só adiam a solução.

Posso ver aqui o melhor horário para você... Pode ser essa semana ainda ou prefere aguardar mais uns dias? 📅`;
      }
      
      return `É tão bom quando conseguimos voltar à rotina com tranquilidade, né ${session.firstName}? O Dr. Quelson é especialista exatamente nisso que você está passando. Que tal agendarmos uma conversa com ele? 😊`;

    default:
      // Respostas para situações especiais
      if (intent === 'convenio') {
        return `${session.firstName}, aqui é particular, mas posso te dizer uma coisa? Muita gente que vem aqui já passou por vários médicos do convênio... e depois fala que valeu cada centavo investir numa consulta onde realmente se sentiram ouvidas. Quer que eu te conte como funciona? 😊`;
      }
      
      if (intent === 'urgencia') {
        return `${session.firstName}, entendo sua urgência! Para eu conseguir te ajudar da melhor forma, pode me contar rapidinho o que está acontecendo? 🙏`;
      }
      
      return `${session.firstName}, estou aqui para te ajudar da melhor forma. Pode me contar o que você precisa? 💬`;
  }
}

// ---- Webhook de mensagens (POST) --------------------------------------------
app.post('/webhook', async (req, res) => {
  try {
    console.log('Webhook recebido:', JSON.stringify(req.body, null, 2));
    
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const messageData = changes?.value?.messages?.[0];

    if (!messageData || !messageData.text?.body) {
      console.log('Mensagem ignorada (não é de texto ou vazia).');
      return res.sendStatus(200);
    }

    const from = messageData.from;
    const text = messageData.text.body;
    
    console.log(`[${new Date().toLocaleTimeString()}] ${from}: ${text}`);

    const session = getSession(from);
    const reply = await generateReply(session, from, text);
    
    console.log(`[${new Date().toLocaleTimeString()}] Bot → ${session.firstName || from}: ${reply.substring(0, 100)}...`);

    const response = await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
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

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Erro ao enviar mensagem:', errorData);
    }

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

// ---- Rota de status --------------------------------------------------------
app.get('/', (req, res) => {
  res.json({
    status: '💼 Secretária NEPQ Humanizada Online',
    metodo: 'Neuro Emotional Persuasion Questions',
    especialidade: 'Dr. Quelson - Gastroenterologia',
    recursos: ['Emojis', 'Linguagem Natural', 'Prova Social', 'Múltiplas Respostas'],
    timestamp: new Date().toISOString()
  });
});

// ---- Inicialização -----------------------------------------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`💼 Secretária NEPQ Humanizada rodando na porta ${PORT}`);
  console.log(`🧠 Método: Neuro Emotional Persuasion Questions`);
  console.log(`⚕️ Dr. Quelson - Gastroenterologia`);
  console.log(`💬 Linguagem humanizada com emojis e prova social`);
});
