// bot.js - Secretária NEPQ Blindada CORRIGIDA
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');

const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const fs = require('fs');

const app = express();
app.use(bodyParser.json());

// ---- CONTROLE DE CUSTOS MAIS RIGOROSO ---------------------------------------
let dailyTokenCount = 0;
let dailyRequestCount = 0;
let hourlyTokenCount = 0;
let hourlyRequestCount = 0;

// Limites mais conservadores
const MAX_DAILY_TOKENS = 50000; // Reduzido de 100k para 50k ($50/dia max)
const MAX_DAILY_REQUESTS = 2000; // Reduzido de 5k para 2k
const MAX_HOURLY_TOKENS = 5000; // Novo: limite por hora
const MAX_HOURLY_REQUESTS = 200; // Novo: limite por hora

const rateLimiter = new Map();
const emergencyPhones = new Set();

// Reset diário dos contadores
setInterval(() => {
  dailyTokenCount = 0;
  dailyRequestCount = 0;
  console.log('🔄 Contadores diários resetados');
}, 24 * 60 * 60 * 1000);

// Reset horário dos contadores
setInterval(() => {
  hourlyTokenCount = 0;
  hourlyRequestCount = 0;
  console.log('🔄 Contadores horários resetados');
}, 60 * 60 * 1000);

// ---- SESSÕES COM GESTÃO DE MEMÓRIA ------------------------------------------
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
      conversationHistory: [],
      lastActivity: Date.now(),
      requestCount: 0,
      timezone: 'America/Sao_Paulo' // Padrão Brasil
    });
  }
  
  // Atualiza última atividade
  const session = sessions.get(phone);
  session.lastActivity = Date.now();
  return session;
}

// Cleanup de sessões antigas (previne memory leak)
function cleanupOldSessions() {
  const TWO_HOURS = 2 * 60 * 60 * 1000;
  const now = Date.now();
  let cleaned = 0;
  
  for (const [phone, session] of sessions.entries()) {
    if (!session.lastActivity || (now - session.lastActivity) > TWO_HOURS) {
      sessions.delete(phone);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Limpeza: ${cleaned} sessões antigas removidas`);
  }
}

// Executa limpeza a cada 30 minutos
setInterval(cleanupOldSessions, 30 * 60 * 1000);

// ---- CONFIGURAÇÃO DA OPENAI -------------------------------------------------
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- DETECÇÃO DE EMERGÊNCIAS MÉDICAS MELHORADA -----------------------------
function isEmergency(message) {
  const emergencyKeywords = [
    // Cardíacas
    'infarto', 'infarte', 'ataque cardiaco', 'ataque cardíaco', 'peito dói muito', 'dor no peito forte',
    'parada cardíaca', 'parada cardiaca', 'coração parou',
    
    // Respiratórias
    'não consigo respirar', 'nao consigo respirar', 'falta de ar grave', 'sufocando',
    'engasgado', 'engasgada', 'asfixia',
    
    // Neurológicas
    'avc', 'derrame', 'convulsão', 'convulsao', 'ataque epilético', 'epileptico',
    'desmaiei', 'desmaiou', 'inconsciente', 'perdeu consciencia',
    
    // Traumas
    'acidente', 'atropelado', 'fratura exposta', 'sangramento grave', 'muito sangue',
    'osso quebrado', 'quebrei o osso', 'sangramento',
    
    // Intoxicações
    'overdose', 'envenenamento', 'intoxicação', 'intoxicacao', 'veneno',
    
    // Emergência geral
    'emergencia', 'emergência', 'urgencia grave', 'urgência grave', 'socorro',
    'samu', '192', '193', '190', 'ambulancia', 'ambulância',
    
    // Suicídio
    'vou me matar', 'quero morrer', 'suicidio', 'suicídio', 'me matar', 'vou morrer', 'morrer',
    
    // Dor extrema
    'dor insuportável', 'dor insuportavel', 'não aguento mais', 'nao aguento mais'
  ];
  
  const msg = message.toLowerCase().trim();
  return emergencyKeywords.some(keyword => msg.includes(keyword));
}

function getEmergencyResponse(firstName) {
  const name = firstName || 'amigo(a)';
  return `🚨 ${name}, se você está tendo uma emergência médica, por favor:

LIGUE IMEDIATAMENTE:
🚑 SAMU: 192
🚒 Bombeiros: 193  
🚓 Emergência: 190

Vá ao pronto-socorro mais próximo. NÃO ESPERE!

Para consultas não urgentes, retome contato quando estiver seguro.

O Dr. Quelson não atende emergências pelo WhatsApp.`;
}

// ---- RATE LIMITING MELHORADO ------------------------------------------------
function isRateLimited(phone) {
  const now = Date.now();
  const userRequests = rateLimiter.get(phone) || [];
  
  // Remove requests older than 1 minute
  const recentRequests = userRequests.filter(time => now - time < 60000);
  
  // Diferentes limites baseado no histórico do usuário
  let maxRequests = 10; // Padrão: 10 por minuto
  
  // Usuários novos: limite menor
  if (recentRequests.length === 0) {
    maxRequests = 5;
  }
  
  // Usuários com muitas mensagens: limite maior
  const session = sessions.get(phone);
  if (session && session.conversationHistory && session.conversationHistory.length > 20) {
    maxRequests = 15;
  }
  
  if (recentRequests.length >= maxRequests) {
    return true;
  }
  
  recentRequests.push(now);
  rateLimiter.set(phone, recentRequests);
  return false;
}

// ---- CONTROLE DE CUSTOS MAIS RIGOROSO ---------------------------------------
function checkCostLimits() {
  // Verifica limites horários primeiro
  if (hourlyTokenCount > MAX_HOURLY_TOKENS) {
    throw new Error(`Limite HORÁRIO de tokens excedido: ${hourlyTokenCount}/${MAX_HOURLY_TOKENS}`);
  }
  
  if (hourlyRequestCount > MAX_HOURLY_REQUESTS) {
    throw new Error(`Limite HORÁRIO de requests excedido: ${hourlyRequestCount}/${MAX_HOURLY_REQUESTS}`);
  }
  
  // Depois verifica limites diários
  if (dailyTokenCount > MAX_DAILY_TOKENS) {
    throw new Error(`Limite DIÁRIO de tokens excedido: ${dailyTokenCount}/${MAX_DAILY_TOKENS}`);
  }
  
  if (dailyRequestCount > MAX_DAILY_REQUESTS) {
    throw new Error(`Limite DIÁRIO de requests excedido: ${dailyRequestCount}/${MAX_DAILY_REQUESTS}`);
  }
}

// ---- COMPRESSÃO DE CONTEXTO --------------------------------------------------
function compressContext(history) {
  if (!history || history.length <= 30) return history;
  
  // Mantém primeiras 10 e últimas 20 mensagens para economizar tokens
  const compressed = [
    ...history.slice(0, 10),
    `... [${history.length - 30} mensagens resumidas] ...`,
    ...history.slice(-20)
  ];
  
  return compressed;
}

// ---- FUNÇÕES AUXILIARES BLINDADAS -------------------------------------------
function extractFirstName(text) {
  if (!text || typeof text !== 'string') return 'Paciente';
  
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
      // Sanitiza e capitaliza
      const safeName = name.replace(/[^a-záàãâéêíóôõúç]/gi, '');
      return safeName.charAt(0).toUpperCase() + safeName.slice(1);
    }
  }
  
  return text.trim().split(' ')[0].replace(/[^a-záàãâéêíóôõúç]/gi, '') || 'Paciente';
}

function containsFirstNameOnly(text) {
  if (!text || typeof text !== 'string') return false;
  
  const cleaned = text.trim().toLowerCase();
  
  const namePatterns = [
    /(?:aqui (?:é|eh) |sou (?:a |o )?|me chamo |meu nome (?:é|eh) )/,
    /^[a-záàãâéêíóôõúç\s]+$/i
  ];
  
  if (namePatterns.some(pattern => pattern.test(cleaned))) {
    return true;
  }
  
  if (cleaned.length < 2 || cleaned.length > 50 || /\d|[!@#$%^&*()_+=\[\]{}|;':",./<>?]/.test(cleaned)) {
    return false;
  }
  
  return true;
}

// ---- HORÁRIO INTELIGENTE (TIMEZONE AWARE) -----------------------------------
function getCurrentGreeting() {
  const now = new Date();
  // Força timezone do Brasil
  const brasilTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
  const hour = brasilTime.getHours();
  
  if (hour >= 5 && hour < 12) {
    return 'Bom dia!';
  } else if (hour >= 12 && hour < 18) {
    return 'Boa tarde!';
  } else {
    return 'Boa noite!';
  }
}

// ---- FALLBACK SEM IA (QUANDO OPENAI FALHA) ----------------------------------
function detectIntentFallback(message, stage, session) {
  const msg = message.toLowerCase().trim();
  
  // Emergência sempre tem prioridade
  if (isEmergency(msg)) return 'emergencia';
  
  // Baseado em palavras-chave simples
  if (msg.includes('agendar') || msg.includes('marcar') || msg.includes('consulta')) return 'agendar';
  if (msg.includes('valor') || msg.includes('preço') || msg.includes('custa') || msg.includes('quanto')) return 'valores';
  if (msg.includes('convênio') || msg.includes('convenio') || msg.includes('plano') || msg.includes('unimed')) return 'convenio';
  if (msg.includes('horário') || msg.includes('horario') || msg.includes('funciona') || msg.includes('atende')) return 'horarios';
  if (msg.includes('dor') || msg.includes('sintoma') || msg.includes('problema') || msg.includes('sinto')) return 'sintomas';
  if (msg.includes('sim') || msg.includes('ok') || msg.includes('tudo bem') || msg.includes('pode')) return 'positiva';
  if (msg.includes('não') || msg.includes('nao') || msg.includes('nunca') || msg.includes('jamais')) return 'negativa';
  if (msg.includes('depende') || msg.includes('preciso saber') || msg.includes('antes')) return 'condicional';
  if (msg.includes('oi') || msg.includes('olá') || msg.includes('ola') || msg.includes('tchau')) return 'saudacao';
  
  return 'outra';
}

// ---- CLASSIFICADOR COM IA + FALLBACK MELHORADO ------------------------------
async function detectIntent(message, stage, session, retries = 2) {
  try {
    checkCostLimits();
    
    // Comprime histórico para economizar tokens
    const compressedHistory = compressContext(session.conversationHistory || []);
    
    const conversationContext = `
CONTEXTO:
- Nome: ${session.firstName || 'N/A'}
- Estágio: ${stage}
- Problema: ${session.problemContext || 'N/A'}
- Última intenção: ${session.lastIntent || 'N/A'}

HISTÓRICO:
${compressedHistory.slice(-5).join('\n')}
`.trim();

    const prompt = `Analise a intenção da mensagem:

${conversationContext}

CATEGORIAS: emergencia, agendar, valores, sintomas, convenio, horarios, positiva, negativa, condicional, saudacao, outra

MENSAGEM: "${message}"

Responda SÓ a categoria:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 10, // Reduzido para economia
      temperature: 0,
    });

    const tokens = response.usage?.total_tokens || 10;
    dailyTokenCount += tokens;
    hourlyTokenCount += tokens;
    dailyRequestCount++;
    hourlyRequestCount++;
    
    const result = response.choices[0].message.content.trim().toLowerCase();
    
    // Valida resultado
    const validCategories = ['emergencia', 'agendar', 'valores', 'sintomas', 'convenio', 'horarios', 'positiva', 'negativa', 'condicional', 'saudacao', 'outra'];
    if (!validCategories.includes(result)) {
      console.warn(`⚠️ IA retornou categoria inválida: ${result}, usando fallback`);
      return detectIntentFallback(message, stage, session);
    }
    
    return result;
    
  } catch (error) {
    console.error(`⚠️ OpenAI falhou (tentativa ${3-retries}):`, error.message);
    
    if (retries > 0) {
      // Wait and retry
      await new Promise(resolve => setTimeout(resolve, 1000));
      return detectIntent(message, stage, session, retries - 1);
    }
    
    // Final fallback
    return detectIntentFallback(message, stage, session);
  }
}

// ---- RESPOSTAS VARIADAS PARA NATURALIDADE -----------------------------------
function getRandomResponse(responses) {
  if (!responses || !Array.isArray(responses) || responses.length === 0) {
    return 'Desculpe, estou com dificuldades técnicas. Como posso te ajudar?';
  }
  return responses[Math.floor(Math.random() * responses.length)];
}

// ---- GERAÇÃO DE RESPOSTA BLINDADA -------------------------------------------
async function generateReply(session, from, message) {
  try {
    // Previne loops infinitos
    if (session.repeatCount > 5) {
      return `${session.firstName || 'Paciente'}, percebo que estamos tendo dificuldades na comunicação. Que tal ligar diretamente para (11) 99999-9999? Assim posso te ajudar melhor! 😊`;
    }
    
    // Previne mensagens muito longas
    if (message.length > 500) {
      return `${session.firstName || 'Paciente'}, sua mensagem é um pouco longa. Pode resumir em poucas palavras o que precisa? Assim consigo te atender melhor! 😊`;
    }
    
    // Adiciona mensagem ao histórico
    if (!session.conversationHistory) {
      session.conversationHistory = [];
    }
    session.conversationHistory.push(`Paciente: ${message}`);
    
    // Mantém últimas 100 mensagens (com compressão inteligente)
    if (session.conversationHistory.length > 100) {
      session.conversationHistory = session.conversationHistory.slice(-100);
    }

    const intent = await detectIntent(message, session.stage, session);

    // Detecta loops de repetição
    if (intent === session.lastIntent) {
      session.repeatCount += 1;
    } else {
      session.repeatCount = 0;
    }
    session.lastIntent = intent;

    // EMERGÊNCIA tem prioridade máxima
    if (intent === 'emergencia') {
      const emergencyReply = getEmergencyResponse(session.firstName);
      emergencyPhones.add(from); // Marca para não repetir
      session.conversationHistory.push(`Bot: ${emergencyReply}`);
      return emergencyReply;
    }

    // Captura de nome com saudação calorosa
    if (!session.firstName) {
      if (!session.askedName) {
        session.askedName = true;
        const saudacao = getCurrentGreeting();
        
        const saudacoes = [
          `${saudacao} Você entrou em contato com o Consultório do Dr. Quelson, especialista em Gastroenterologia. Com quem eu tenho o prazer de falar? 😊`,
          `${saudacao} Aqui é do consultório do Dr. Quelson. É um prazer falar com você! Qual seu nome?`,
          `${saudacao} Você está falando com a secretária do Dr. Quelson. Como posso te chamar?`
        ];
        const reply = getRandomResponse(saudacoes);
        session.conversationHistory.push(`Bot: ${reply}`);
        return reply;
      }
      
      if (containsFirstNameOnly(message)) {
        session.firstName = extractFirstName(message);
        session.stage = 'situacao';
        
        const situacaoResponses = [
          `Oi, ${session.firstName}! Tudo bem? Como posso te ajudar hoje? O que te motivou a procurar o Dr. Quelson? 🧡`,
          `É um prazer falar com você, ${session.firstName}! 😊 Pode me contar um pouquinho o que está te incomodando? Assim consigo te orientar melhor 🙏`,
          `Seja bem-vindo(a), ${session.firstName}! Queria te escutar um pouquinho... Pode me contar o que tem te preocupado? Às vezes só isso já alivia 💬`
        ];
        const reply = getRandomResponse(situacaoResponses);
        session.conversationHistory.push(`Bot: ${reply}`);
        return reply;
      } else {
        const reply = 'Desculpe, não consegui entender seu nome. Pode me dizer apenas seu primeiro nome, por favor?';
        session.conversationHistory.push(`Bot: ${reply}`);
        return reply;
      }
    }

    let reply = '';

    // Fluxo NEPQ humanizado baseado no estágio
    switch (session.stage) {
      case 'situacao':
        // 🟢 SITUAÇÃO - Entendendo o contexto com empatia
        if (intent === 'agendar') {
          session.stage = 'problema';
          session.problemContext = 'agendamento_direto';
          reply = `Entendo, ${session.firstName}. Para eu conseguir o melhor horário e preparar o Dr. Quelson para te atender bem, pode me contar o que está te incomodando? 🙏`;
        } else if (intent === 'convenio') {
          reply = `${session.firstName}, aqui o Dr. Quelson atende particular, mas posso te dizer uma coisa? Muita gente que vem aqui já passou por vários médicos do convênio... e depois fala que valeu cada centavo investir numa consulta onde realmente se sentiram ouvidas. 

A consulta é R$ 400,00. Pode me contar qual o motivo que te trouxe aqui? Assim posso te explicar se é o tipo de caso que o Dr. Quelson pode te ajudar 😊`;
        } else if (intent === 'condicional') {
          reply = `${session.firstName}, entendo que você precisa se planejar! Aqui é atendimento particular (R$ 400,00). Mas me conta: o que está te preocupando? Assim posso te orientar se vale a pena investir numa consulta especializada 😊`;
        } else if (intent === 'valores') {
          reply = `${session.firstName}, a consulta é R$ 400,00. Mas antes de te explicar como funciona, me ajuda com uma coisa? O que exatamente está te preocupando? Assim posso te explicar direitinho como o Dr. Quelson pode te ajudar 😊`;
        } else if (intent === 'sintomas') {
          session.stage = 'problema';
          session.problemContext = message;
          const problemResponses = [
            `Nossa, ${session.firstName}... deve ser bem difícil mesmo 😔 E isso tem te incomodado mais em qual parte do dia? De manhã, à noite...?`,
            `Poxa, ${session.firstName}, entendo... Há quanto tempo está assim?`,
            `Nossa, ${session.firstName}... Deve ser bem preocupante. Me conta, há quanto tempo você sente isso?`
          ];
          reply = getRandomResponse(problemResponses);
        } else if (intent === 'urgencia') {
          session.stage = 'problema';
          reply = `${session.firstName}, entendo sua urgência. Para eu conseguir o melhor horário para você, pode me contar rapidinho o que está acontecendo?`;
        } else {
          reply = `${session.firstName}, pode me contar um pouquinho do que está te incomodando? Como posso te ajudar melhor com isso que você está sentindo? 💬`;
        }
        break;

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
            reply = getRandomResponse(worseningQuestions);
          } else if (!session.worsening) {
            session.worsening = message;
            const solutionQuestions = [
              `Você já passou com algum médico por isso antes? Sentiu que te ajudaram de verdade?`,
              `Já tentou algum tratamento ou medicação para isso?`,
              `E você já tentou resolver de alguma forma? Algum tratamento, medicação ou mudança na alimentação?`
            ];
            reply = getRandomResponse(solutionQuestions);
          } else if (!session.triedSolutions) {
            session.triedSolutions = message;
            session.stage = 'implicacao';
            const implicationStarters = [
              `Entendo, ${session.firstName}... Você sente que isso tem afetado sua rotina?`,
              `Puxa, ${session.firstName}... E isso já atrapalhou seu sono ou alimentação?`,
              `Nossa... Já parou pra pensar no quanto isso te desgasta emocionalmente? 😞`
            ];
            reply = getRandomResponse(implicationStarters);
          }
        } else {
          const problemQuestions = [
            `${session.firstName}, me conta: há quanto tempo você sente isso?`,
            `E isso tem te incomodado mais em qual parte do dia, ${session.firstName}?`,
            `Nossa, ${session.firstName}... deve ser bem difícil mesmo 😔 Há quanto tempo está assim?`
          ];
          reply = getRandomResponse(problemQuestions);
        }
        break;

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
            reply = getRandomResponse(futureQuestions);
          }
        } else {
          const implicationQuestions = [
            `E se eu te perguntasse: isso já está afetando seu dia a dia? Sua alimentação, sono, ou sua tranquilidade em geral?`,
            `Você sente que isso tem afetado sua rotina, ${session.firstName}?`,
            `Já parou pra pensar no quanto isso te desgasta emocionalmente? 😞`
          ];
          reply = getRandomResponse(implicationQuestions);
        }
        break;

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
          reply = getRandomResponse(visualizationResponses);
        } else {
          const solutionQuestions = [
            `${session.firstName}, imagina só se isso já estivesse resolvido... o que você faria diferente no seu dia? 🌞`,
            `E se você tivesse um plano claro pra resolver isso, montado por alguém que realmente te escuta... o quanto isso te traria mais paz?`,
            `Como seria sua vida se esse problema não existisse mais? ✨`
          ];
          reply = getRandomResponse(solutionQuestions);
        }
        break;

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
          reply = getRandomResponse(agendamentoResponses);
        } else if (intent === 'valores') {
          reply = `${session.firstName}, a consulta é R$ 400,00, e olha... vale cada centavo. É uma consulta de 60 minutos onde o Dr. Quelson realmente te escuta e investiga a fundo. Muitos pacientes já me disseram: "Se soubesse que era assim, teria vindo muito antes".

O que o Dr. faz é ir direto na raiz do problema e montar um plano específico pro seu caso. Isso acaba evitando meses de sofrimento e tentativas que só adiam a solução.

Posso ver aqui o melhor horário para você... Pode ser essa semana ainda ou prefere aguardar mais uns dias? 📅`;
        } else {
          reply = `É tão bom quando conseguimos voltar à rotina com tranquilidade, né ${session.firstName}? O Dr. Quelson é especialista exatamente nisso que você está passando. Que tal agendarmos uma conversa com ele? 😊`;
        }
        break;

      default:
        // Respostas para situações especiais
        if (intent === 'convenio') {
          reply = `${session.firstName}, aqui é particular, mas posso te dizer uma coisa? Muita gente que vem aqui já passou por vários médicos do convênio... e depois fala que valeu cada centavo investir numa consulta onde realmente se sentiram ouvidas. Quer que eu te conte como funciona? 😊`;
        } else if (intent === 'urgencia') {
          reply = `${session.firstName}, entendo sua urgência! Para eu conseguir te ajudar da melhor forma, pode me contar rapidinho o que está acontecendo? 🙏`;
        } else {
          reply = `${session.firstName}, estou aqui para te ajudar da melhor forma. Pode me contar o que você precisa? 💬`;
        }
    }

    // Adiciona resposta ao histórico antes de retornar
    session.conversationHistory.push(`Bot: ${reply}`);
    return reply;

  } catch (error) {
    console.error('🚨 Erro crítico na geração de resposta:', error);
    
    // Fallback de emergência
    const safeName = session.firstName || 'amigo(a)';
    return `Desculpe, ${safeName}, estou com dificuldades técnicas momentâneas. Por favor, ligue para (11) 99999-9999 para agendamento direto. Obrigada pela compreensão! 😊`;
  }
}

// ---- VALIDAÇÃO DE PAYLOAD ---------------------------------------------------
function validateWebhookPayload(body) {
  if (!body || typeof body !== 'object') {
    throw new Error('Payload inválido: body não é objeto');
  }
  
  if (!body.entry || !Array.isArray(body.entry)) {
    throw new Error('Payload inválido: entry não é array');
  }
  
  return true;
}

// ---- ENVIO DE MENSAGEM BLINDADO - CORRIGIDO ---------------------------------
async function sendMessage(to, message, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: to,
          text: { body: message },
        }),
      });

      if (response.ok) {
        return true;
      } else {
        const errorData = await response.text();
        console.error(`❌ Tentativa ${attempt}/${retries} falhou:`, errorData);
        
        // Se é erro de token, não tenta novamente
        if (errorData.includes('OAuthException') || errorData.includes('access token')) {
          console.error('🚨 ERRO DE TOKEN - Não retentando');
          throw new Error(`Token inválido: ${errorData}`);
        }
        
        if (attempt === retries) {
          throw new Error(`Falha após ${retries} tentativas: ${errorData}`);
        }
        
        // Wait before retry (exponential backoff)
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
      }
    } catch (error) {
      console.error(`❌ Erro na tentativa ${attempt}/${retries}:`, error.message);
      
      if (attempt === retries) {
        throw error;
      }
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
    }
  }
  
  return false; // CORREÇÃO: Retorna false se todas as tentativas falharem
}

// ---- LOGGING CRÍTICO --------------------------------------------------------
function logCriticalError(error, context) {
  const errorLog = {
    timestamp: new Date().toISOString(),
    error: error.message,
    stack: error.stack,
    context,
    severity: 'CRITICAL',
    dailyTokens: dailyTokenCount,
    dailyRequests: dailyRequestCount,
    activeSessions: sessions.size
  };
  
  console.error('🚨 ERRO CRÍTICO:', JSON.stringify(errorLog, null, 2));
  
  // Em produção: enviar para sistema de monitoramento
  // sendToSlack(errorLog) ou sendToEmail(errorLog)
}

// ---- WEBHOOK BLINDADO CONTRA TODOS OS ERROS ---------------------------------
app.post('/webhook', async (req, res) => {
  const startTime = Date.now();
  let from = 'unknown';
  
  try {
    // 1. VALIDAÇÃO DE PAYLOAD
    validateWebhookPayload(req.body);
    
    console.log('📨 Webhook recebido:', JSON.stringify(req.body, null, 2));
    
    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const messageData = changes?.value?.messages?.[0];

    // 2. FILTROS DE MENSAGEM
    if (!messageData) {
      console.log('ℹ️ Webhook sem mensagem, ignorando');
      return res.sendStatus(200);
    }

    // Extrai dados básicos
    from = messageData.from;
    const messageType = messageData.type;
    
    // 3. RATE LIMITING POR USUÁRIO
    if (isRateLimited(from)) {
      console.log(`⚠️ Rate limit atingido para ${from}`);
      await sendMessage(from, 'Por favor, aguarde um momento antes de enviar outra mensagem. Obrigada! 😊');
      return res.status(429).send('Rate limited');
    }

    // 4. CONTROLE DE TIPOS DE MÍDIA
    if (messageType !== 'text') {
      console.log(`📎 Mídia recebida (${messageType}) de ${from}`);
      const session = getSession(from);
      const mediaResponse = `${session.firstName || 'Olá'}, recebi sua ${messageType === 'audio' ? 'mensagem de áudio' : 'mídia'}! 
      
Por favor, pode escrever em texto? Assim consigo te atender melhor! 😊

Para emergências, ligue:
🚑 SAMU: 192
📞 Consultório: (11) 99999-9999`;
      
      await sendMessage(from, mediaResponse);
      return res.sendStatus(200);
    }

    const text = messageData.text?.body;
    
    if (!text || text.trim().length === 0) {
      console.log('ℹ️ Mensagem de texto vazia, ignorando');
      return res.sendStatus(200);
    }

    console.log(`[${new Date().toLocaleTimeString()}] 📞 ${from}: ${text}`);

    // 5. CONTROLE DE SESSÃO
    const session = getSession(from);
    session.requestCount = (session.requestCount || 0) + 1;

    // Previne spam de um usuário
    if (session.requestCount > 100) {
      console.log(`🚫 Usuário ${from} excedeu limite de mensagens`);
      await sendMessage(from, 'Por hoje já conversamos bastante! Para continuar, ligue para (11) 99999-9999. Obrigada! 😊');
      return res.sendStatus(200);
    }

    // 6. DETECÇÃO DE EMERGÊNCIA (prioridade máxima)
    if (isEmergency(text) && !emergencyPhones.has(from)) {
      console.log(`🚨 EMERGÊNCIA detectada de ${from}: ${text}`);
      const emergencyReply = getEmergencyResponse(session.firstName);
      await sendMessage(from, emergencyReply);
      emergencyPhones.add(from);
      
      // Log especial para emergências
      const emergencyLog = {
        timestamp: new Date().toISOString(),
        phone: from,
        message: text,
        type: 'EMERGENCY',
        firstName: session.firstName
      };
      console.error('🚨 EMERGÊNCIA MÉDICA:', JSON.stringify(emergencyLog));
      
      return res.sendStatus(200);
    }

    // 7. GERAÇÃO DE RESPOSTA PRINCIPAL
    const reply = await generateReply(session, from, text);
    
    console.log(`[${new Date().toLocaleTimeString()}] 🤖 → ${session.firstName || from}: ${reply.substring(0, 100)}${reply.length > 100 ? '...' : ''}`);

    // 8. ENVIO COM RETRY
    await sendMessage(from, reply);

    // 9. MÉTRICAS DE PERFORMANCE
    const processingTime = Date.now() - startTime;
    if (processingTime > 5000) {
      console.warn(`⚠️ Processamento lento: ${processingTime}ms para ${from}`);
    }

    res.sendStatus(200);

  } catch (error) {
    // 10. TRATAMENTO DE ERRO CRÍTICO
    logCriticalError(error, {
      body: req.body,
      from,
      dailyTokens: dailyTokenCount,
      dailyRequests: dailyRequestCount,
      processingTime: Date.now() - startTime
    });

    // Fallback graceful
    try {
      const session = getSession(from);
      const fallbackMessage = `Desculpe, ${session.firstName || 'amigo(a)'}, estou com dificuldades técnicas. 

Para agendamento imediato:
📞 Ligue: (11) 99999-9999
⏰ Seg-Sex: 8h às 18h
⏰ Sáb: 8h às 12h

Obrigada pela compreensão! 😊`;
      
      await sendMessage(from, fallbackMessage);
    } catch (fallbackError) {
      console.error('💀 Falha total no fallback:', fallbackError);
    }

    res.status(500).json({
      error: 'Internal server error',
      timestamp: new Date().toISOString(),
      reference: `ERR-${Date.now()}`
    });
  }
});

// ---- VALIDAÇÃO DO WEBHOOK (GET) ---------------------------------------------
app.get('/webhook', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  console.log(`🔐 Verificação webhook: mode=${mode}, token=${token ? 'PROVIDED' : 'MISSING'}`);

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ Webhook verificado com sucesso!');
    return res.status(200).send(challenge);
  } else {
    console.log('❌ Falha na verificação do webhook');
    return res.sendStatus(403);
  }
});

// ---- ROTA DE STATUS E MONITORAMENTO -----------------------------------------
app.get('/', (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.json({
    status: '💼 Secretária NEPQ Blindada Online',
    version: '2.0.1-corrected',
    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    memory: {
      used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
    },
    metrics: {
      activeSessions: sessions.size,
      dailyTokens: dailyTokenCount,
      dailyRequests: dailyRequestCount,
      hourlyTokens: hourlyTokenCount,
      hourlyRequests: hourlyRequestCount,
      maxDailyTokens: MAX_DAILY_TOKENS,
      maxDailyRequests: MAX_DAILY_REQUESTS,
      maxHourlyTokens: MAX_HOURLY_TOKENS,
      maxHourlyRequests: MAX_HOURLY_REQUESTS,
      rateLimiterSize: rateLimiter.size,
      emergencyPhonesSize: emergencyPhones.size
    },
    features: [
      '🚨 Detecção de emergência melhorada',
      '⚡ Rate limiting inteligente',
      '🧠 Context compression',
      '💰 Cost monitoring rigoroso',
      '🔄 Auto-retry com backoff',
      '🛡️ Error recovery robusto',
      '🧹 Memory cleanup automático',
      '📊 Real-time metrics',
      '🕐 Timezone Brasil correto'
    ],
    timestamp: new Date().toISOString()
  });
});

// ---- ROTA DE MÉTRICAS PARA MONITORAMENTO ------------------------------------
app.get('/metrics', (req, res) => {
  res.json({
    sessions: {
      active: sessions.size,
      list: Array.from(sessions.keys()).map(phone => ({
        phone: phone.substring(0, 5) + '***',
        stage: sessions.get(phone)?.stage,
        messageCount: sessions.get(phone)?.conversationHistory?.length || 0,
        lastActivity: sessions.get(phone)?.lastActivity
      }))
    },
    usage: {
      dailyTokens: dailyTokenCount,
      dailyRequests: dailyRequestCount,
      hourlyTokens: hourlyTokenCount,
      hourlyRequests: hourlyRequestCount,
      tokenLimit: MAX_DAILY_TOKENS,
      requestLimit: MAX_DAILY_REQUESTS,
      tokenPercentage: ((dailyTokenCount / MAX_DAILY_TOKENS) * 100).toFixed(1),
      requestPercentage: ((dailyRequestCount / MAX_DAILY_REQUESTS) * 100).toFixed(1)
    },
    rateLimiting: {
      activeUsers: rateLimiter.size,
      emergencyPhones: emergencyPhones.size
    },
    system: {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      nodeVersion: process.version
    }
  });
});

// ---- ROTA DE RESET (PARA EMERGÊNCIAS) ---------------------------------------
app.post('/reset', (req, res) => {
  const { password } = req.body;
  
  if (password !== process.env.RESET_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Reset completo do sistema
  sessions.clear();
  rateLimiter.clear();
  emergencyPhones.clear();
  dailyTokenCount = 0;
  dailyRequestCount = 0;
  hourlyTokenCount = 0;
  hourlyRequestCount = 0;
  
  console.log('🔄 Sistema resetado manualmente');
  
  res.json({
    message: 'Sistema resetado com sucesso',
    timestamp: new Date().toISOString()
  });
});

// ---- HEALTH CHECK -----------------------------------------------------------
app.get('/health', (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {
      openai: process.env.OPENAI_API_KEY ? 'configured' : 'missing',
      whatsapp: process.env.WHATSAPP_TOKEN ? 'configured' : 'missing',
      memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024 ? 'ok' : 'high',
      sessions: sessions.size < 1000 ? 'ok' : 'high'
    }
  };
  
  const allHealthy = Object.values(health.checks).every(check => 
    check === 'configured' || check === 'ok'
  );
  
  res.status(allHealthy ? 200 : 503).json(health);
});

// ---- CLEANUP JOBS MELHORADOS ------------------------------------------------
// Limpeza de sessões antigas a cada 30 minutos
setInterval(cleanupOldSessions, 30 * 60 * 1000);

// Limpeza de rate limiter a cada 5 minutos (mais agressiva)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [phone, requests] of rateLimiter.entries()) {
    const recentRequests = requests.filter(time => now - time < 60000);
    if (recentRequests.length === 0) {
      rateLimiter.delete(phone);
      cleaned++;
    } else {
      rateLimiter.set(phone, recentRequests);
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Rate limiter: ${cleaned} usuários inativos removidos`);
  }
}, 5 * 60 * 1000);

// Limpeza de emergencyPhones a cada 1 hora
setInterval(() => {
  const size = emergencyPhones.size;
  emergencyPhones.clear();
  if (size > 0) {
    console.log(`🧹 Emergency phones: ${size} registros limpos`);
  }
}, 60 * 60 * 1000);

// NOVO: Limpeza de memória forçada a cada 6 horas
setInterval(() => {
  if (global.gc) {
    global.gc();
    console.log('🧹 Garbage collection manual executada');
  }
}, 6 * 60 * 60 * 1000);

// ---- GRACEFUL SHUTDOWN ------------------------------------------------------
process.on('SIGTERM', () => {
  console.log('📴 Recebido SIGTERM, fazendo shutdown graceful...');
  
  // Log final
  console.log(`📊 Stats finais: ${sessions.size} sessões, ${dailyTokenCount} tokens, ${dailyRequestCount} requests`);
  
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('📴 Recebido SIGINT, fazendo shutdown graceful...');
  process.exit(0);
});

// ---- INICIALIZAÇÃO -----------------------------------------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log('🚀🛡️ === SECRETÁRIA NEPQ BLINDADA CORRIGIDA === 🛡️🚀');
  console.log(`📍 Porta: ${PORT}`);
  console.log(`🧠 Método: Neuro Emotional Persuasion Questions`);
  console.log(`⚕️ Especialidade: Dr. Quelson - Gastroenterologia`);
  console.log(`🔗 Webhook: https://meu-bot-jhcl.onrender.com/webhook`);
  console.log('');
  console.log('🛡️ PROTEÇÕES ATIVAS:');
  console.log('  ✅ Detecção de emergência médica melhorada');
  console.log('  ✅ Rate limiting por usuário inteligente');
  console.log('  ✅ Controle de custos OpenAI rigoroso');
  console.log('  ✅ Cleanup automático de memória');
  console.log('  ✅ Fallback sem IA robusto');
  console.log('  ✅ Retry automático com exponential backoff');
  console.log('  ✅ Context compression inteligente');
  console.log('  ✅ Timezone Brasil correto');
  console.log('  ✅ Validação de payload completa');
  console.log('  ✅ Graceful error handling');
  console.log('');
  console.log(`💰 Limites: ${MAX_DAILY_TOKENS} tokens/dia, ${MAX_DAILY_REQUESTS} requests/dia`);
  console.log(`⏰ Limites horários: ${MAX_HOURLY_TOKENS} tokens/hora, ${MAX_HOURLY_REQUESTS} requests/hora`);
  console.log('📊 Monitoramento: /metrics');
  console.log('🏥 Health check: /health');
  console.log('');
  console.log('💼 Pronta para atender pacientes com segurança máxima!');
});
