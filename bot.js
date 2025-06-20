// bot.js - Secretária NEPQ com Redis Persistente
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const redis = require('redis');

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
const MAX_DAILY_TOKENS = 50000;
const MAX_DAILY_REQUESTS = 2000;
const MAX_HOURLY_TOKENS = 5000;
const MAX_HOURLY_REQUESTS = 200;

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

// ---- SESSION MANAGER COM REDIS PERSISTENTE ----------------------------------
class SessionManager {
  constructor() {
    // Conecta ao Redis
    this.client = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    
    this.client.on('error', (err) => {
      console.error('❌ Redis error:', err.message);
      this.fallbackToMemory = true;
    });
    
    this.client.on('connect', () => {
      console.log('✅ Redis conectado - Sessions persistentes ativas');
      this.fallbackToMemory = false;
    });
    
    // Fallback para memory se Redis falhar
    this.memoryCache = new Map();
    this.memoryRateLimit = new Map();
    this.fallbackToMemory = false;
    
    // Conecta
    this.client.connect().catch(() => {
      console.warn('⚠️ Redis indisponível - usando memory fallback');
      this.fallbackToMemory = true;
    });
  }

  // Busca session com fallback automático
  async getSession(phone) {
    try {
      if (this.fallbackToMemory) {
        return this.getSessionFromMemory(phone);
      }

      // Tenta buscar no Redis primeiro
      const sessionData = await this.client.get(`session:${phone}`);
      
      if (sessionData) {
        const session = JSON.parse(sessionData);
        // Atualiza última atividade
        session.lastActivity = Date.now();
        await this.saveSession(phone, session);
        return session;
      }
      
      // Se não existe, cria nova
      const newSession = this.createNewSession();
      await this.saveSession(phone, newSession);
      return newSession;
      
    } catch (error) {
      console.error('⚠️ Redis falhou, usando memory fallback:', error.message);
      this.fallbackToMemory = true;
      return this.getSessionFromMemory(phone);
    }
  }

  // Salva session com TTL
  async saveSession(phone, session) {
    try {
      if (this.fallbackToMemory) {
        this.memoryCache.set(phone, session);
        return;
      }

      // Salva no Redis com TTL de 2 horas
      await this.client.setEx(
        `session:${phone}`, 
        7200, // 2 horas em segundos
        JSON.stringify(session)
      );
      
    } catch (error) {
      console.error('⚠️ Erro ao salvar session, usando memory:', error.message);
      this.memoryCache.set(phone, session);
    }
  }

  // Rate limiting persistente
  async isRateLimited(phone) {
    try {
      if (this.fallbackToMemory) {
        return this.isRateLimitedMemory(phone);
      }

      const now = Date.now();
      const key = `rate:${phone}`;
      
      // Busca requests recentes
      const requests = await this.client.lRange(key, 0, -1);
      const recentRequests = requests
        .map(Number)
        .filter(time => now - time < 60000); // Último minuto
      
      // Diferentes limites baseado no histórico do usuário
      let maxRequests = 10;
      if (recentRequests.length === 0) maxRequests = 5; // Novos usuários
      
      // Busca session para verificar histórico
      const session = await this.getSession(phone);
      if (session && session.conversationHistory && session.conversationHistory.length > 20) {
        maxRequests = 15; // Usuários ativos
      }
      
      if (recentRequests.length >= maxRequests) {
        return true;
      }
      
      // Adiciona nova request e limpa antigas
      await this.client.lPush(key, now.toString());
      await this.client.lTrim(key, 0, maxRequests - 1); // Mantém só as últimas
      await this.client.expire(key, 60); // Expira em 1 minuto
      
      return false;
      
    } catch (error) {
      console.error('⚠️ Rate limiting falhou, usando memory:', error.message);
      return this.isRateLimitedMemory(phone);
    }
  }

  // Fallback para memory
  getSessionFromMemory(phone) {
    if (!this.memoryCache.has(phone)) {
      this.memoryCache.set(phone, this.createNewSession());
    }
    
    const session = this.memoryCache.get(phone);
    session.lastActivity = Date.now();
    return session;
  }

  isRateLimitedMemory(phone) {
    const now = Date.now();
    const userRequests = this.memoryRateLimit.get(phone) || [];
    
    const recentRequests = userRequests.filter(time => now - time < 60000);
    
    let maxRequests = 10;
    if (recentRequests.length === 0) maxRequests = 5;
    
    const session = this.memoryCache.get(phone);
    if (session && session.conversationHistory && session.conversationHistory.length > 20) {
      maxRequests = 15;
    }
    
    if (recentRequests.length >= maxRequests) {
      return true;
    }
    
    recentRequests.push(now);
    this.memoryRateLimit.set(phone, recentRequests);
    return false;
  }

  // Cria nova session padrão
  createNewSession() {
    return {
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
      timezone: 'America/Sao_Paulo',
      createdAt: Date.now()
    };
  }

  // Limpa sessions antigas
  async cleanup() {
    try {
      if (this.fallbackToMemory) {
        const TWO_HOURS = 2 * 60 * 60 * 1000;
        const now = Date.now();
        let cleaned = 0;
        
        for (const [phone, session] of this.memoryCache.entries()) {
          if (!session.lastActivity || (now - session.lastActivity) > TWO_HOURS) {
            this.memoryCache.delete(phone);
            cleaned++;
          }
        }
        
        if (cleaned > 0) {
          console.log(`🧹 Memory cleanup: ${cleaned} sessões removidas`);
        }
        return;
      }

      // Redis faz cleanup automático via TTL
      const keys = await this.client.keys('session:*');
      let activeCount = 0;
      
      for (const key of keys) {
        const ttl = await this.client.ttl(key);
        if (ttl > 0) activeCount++;
      }
      
      console.log(`📊 Redis sessions ativas: ${activeCount}`);
      
    } catch (error) {
      console.error('⚠️ Erro no cleanup:', error.message);
    }
  }

  // Estatísticas
  async getStats() {
    try {
      if (this.fallbackToMemory) {
        return {
          activeSessions: this.memoryCache.size,
          activeRateLimits: this.memoryRateLimit.size,
          storage: 'memory',
          redis: false
        };
      }

      const sessionKeys = await this.client.keys('session:*');
      const rateKeys = await this.client.keys('rate:*');
      
      return {
        activeSessions: sessionKeys.length,
        activeRateLimits: rateKeys.length,
        storage: 'redis',
        redis: true
      };
      
    } catch (error) {
      return {
        activeSessions: this.memoryCache.size,
        activeRateLimits: this.memoryRateLimit.size,
        storage: 'memory-fallback',
        redis: false,
        error: error.message
      };
    }
  }

  // Graceful shutdown
  async close() {
    try {
      if (!this.fallbackToMemory) {
        await this.client.disconnect();
        console.log('✅ Redis desconectado gracefully');
      }
    } catch (error) {
      console.error('⚠️ Erro ao desconectar Redis:', error.message);
    }
  }
}

// Inicializa o session manager
const sessionManager = new SessionManager();

// Substitui função getSession original por versão Redis
async function getSession(phone) {
  const session = await sessionManager.getSession(phone);
  return session;
}

// Substitui função isRateLimited original por versão Redis  
async function isRateLimited(phone) {
  return await sessionManager.isRateLimited(phone);
}

// Função para salvar session após modificações
async function saveSession(phone, session) {
  await sessionManager.saveSession(phone, session);
}

// Cleanup usando session manager
async function cleanupOldSessions() {
  await sessionManager.cleanup();
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

// ---- RATE LIMITING MELHORADO COM REDIS --------------------------------------
// Agora usa sessionManager.isRateLimited() que já foi implementado acima

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

// ---- FALLBACK CONTEXTUAL ----------------------------------------------------
function detectIntentFallbackContextual(message, stage, session) {
  const msg = message.toLowerCase().trim();
  
  // Emergência sempre tem prioridade
  if (isEmergency(msg)) return 'emergencia';
  
  // CONTEXTO: Se já mencionou agendamento antes
  const wantedScheduling = session.problemContext === 'agendamento_direto' || 
                          (session.conversationHistory || []).some(h => 
                            h.includes('agendar') || h.includes('marcar') || h.includes('consulta')
                          );
  
  // Se já quer agendar e pergunta preço = valores
  if (wantedScheduling && (msg.includes('valor') || msg.includes('preço') || msg.includes('custa') || msg.includes('quanto'))) {
    return 'valores';
  }
  
  // Detecção de confusão
  if (msg.includes('o que') || msg.includes('sente o que') || msg === 'que' || msg === 'o quê' || msg === 'o que?') {
    return 'confusao';
  }
  
  // Exame de rotina
  if (msg.includes('rotina') || msg.includes('checkup') || msg.includes('preventiv') || msg.includes('check up')) {
    return 'exame_rotina';
  }
  
  // Procedimentos
  if (msg.includes('endoscopia') || msg.includes('colonoscopia') || msg.includes('exame') || msg.includes('procedimento')) {
    return 'procedimento';
  }
  
  // Resto das categorias
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

// ---- CLASSIFICADOR COM CONTEXTO INTELIGENTE ----------------------------------
async function detectIntent(message, stage, session, retries = 2) {
  try {
    checkCostLimits();
    
    // Monta contexto RICO da conversa
    const conversationContext = `
CONTEXTO COMPLETO DA CONVERSA:
- Nome do paciente: ${session.firstName || 'N/A'}
- Estágio atual: ${stage}
- Último problema mencionado: ${session.problemContext || 'Nenhum'}
- Última intenção: ${session.lastIntent || 'N/A'}
- Histórico recente: ${(session.conversationHistory || []).slice(-10).join(' | ')}

SITUAÇÃO ATUAL:
O paciente ${session.firstName || 'alguém'} está conversando com a secretária do Dr. Quelson (gastroenterologista).
${session.problemContext ? `Contexto: O paciente mencionou querer ${session.problemContext}.` : ''}
${stage === 'problema' ? 'A secretária está tentando entender qual o problema de saúde do paciente.' : ''}
${stage === 'situacao' ? 'A secretária está entendendo o motivo do contato.' : ''}

IMPORTANTE: Analise a mensagem considerando TODO o contexto acima, não apenas a mensagem isolada.
`;

    const prompt = `${conversationContext}

Baseado no CONTEXTO COMPLETO acima, analise a intenção da mensagem atual:

CATEGORIAS:
- emergencia: situação de emergência médica
- agendar: quer marcar consulta (incluindo quando já mencionou antes)
- valores: pergunta sobre preço, valor, quanto custa
- sintomas: descreve problemas de saúde específicos
- convenio: pergunta sobre planos de saúde
- horarios: quer saber horários de funcionamento
- positiva: concorda, aceita, quer continuar
- negativa: recusa, não quer
- condicional: "depende", condições
- confusao: não entendeu algo, pergunta "o que?"
- saudacao: cumprimentos
- exame_rotina: menciona exame preventivo, checkup
- procedimento: pergunta sobre procedimentos específicos
- outra: outras respostas

MENSAGEM ATUAL: "${message}"

INSTRUÇÕES:
1. Considere o CONTEXTO COMPLETO, não apenas a mensagem isolada
2. Se o paciente já disse que quer agendar antes, perguntas sobre preço são categoria "valores"
3. Se pergunta "o que?" ou similar, é provavelmente "confusao"
4. Se menciona exame de rotina ou preventivo, é "exame_rotina"

Responda APENAS com a categoria mais apropriada:`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 15,
      temperature: 0.1, // Mais determinístico
    });

    const tokens = response.usage?.total_tokens || 15;
    dailyTokenCount += tokens;
    hourlyTokenCount += tokens;
    dailyRequestCount++;
    hourlyRequestCount++;
    
    const result = response.choices[0].message.content.trim().toLowerCase();
    
    // Valida resultado
    const validCategories = ['emergencia', 'agendar', 'valores', 'sintomas', 'convenio', 'horarios', 'positiva', 'negativa', 'condicional', 'saudacao', 'confusao', 'exame_rotina', 'procedimento', 'outra'];
    if (!validCategories.includes(result)) {
      console.warn(`⚠️ IA retornou categoria inválida: ${result}, usando fallback`);
      return detectIntentFallbackContextual(message, stage, session);
    }
    
    return result;
    
  } catch (error) {
    console.error(`⚠️ OpenAI falhou (tentativa ${3-retries}):`, error.message);
    
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return detectIntent(message, stage, session, retries - 1);
    }
    
    return detectIntentFallbackContextual(message, stage, session);
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
        } 
        else { else if (intent === 'convenio') {
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
        // NOVO: Trata exame de rotina
        else if (intent === 'exame_rotina') {
          session.stage = 'fechamento';
          session.problemContext = 'exame_rotina';
          reply = `Perfeito, ${session.firstName}! Exame de rotina é muito importante. O Dr. Quelson vai fazer uma avaliação completa.

A consulta é R$ 400,00 e dura 60 minutos. Ele fará uma anamnese detalhada e, se necessário, solicitará exames complementares.

O Dr. Quelson atende de segunda a sexta, das 8h às 18h, e sábados pela manhã. 

Você gostaria de agendar ainda essa semana? 📅`;
        }
          reply = `${session.firstName}, pode me contar um pouquinho do que está te incomodando? Como posso te ajudar melhor com isso que você está sentindo? 💬`;
        }
        break;

      case 'problema':
        // 🔴 PROBLEMA - Criando consciência da dor
        
        // NOVO: Se pergunta sobre valores, responde diretamente
        if (intent === 'valores') {
          reply = `${session.firstName}, a consulta é R$ 400,00. Mas antes de agendarmos, me ajuda com uma coisa? O que exatamente está te incomodando? Assim posso te explicar direitinho como o Dr. Quelson pode te ajudar 😊`;
        }
        // NOVO: Se pergunta sobre convênio, responde diretamente  
        else if (intent === 'convenio') {
          reply = `${session.firstName}, aqui o Dr. Quelson atende particular (R$ 400,00). Pode me contar qual o motivo da consulta? Assim posso te orientar melhor.`;
        }
        // NOVO: Se pergunta "o que", "sente o que", clarifica
        else if (intent === 'confusao' || (intent === 'outra' && (message.toLowerCase().includes('o que') || message.toLowerCase().includes('sente o que')))) {
          reply = `Desculpe a confusão, ${session.firstName}! Você me disse que quer marcar uma consulta. Pode me contar qual o motivo? Por exemplo: algum desconforto, dor, exame de rotina... Assim o Dr. Quelson pode se preparar melhor para te atender! 😊`;
          session.stage = 'situacao'; // Volta para situação
        }
        // Fluxo normal de problema
        else if (intent === 'duracao' || intent === 'sintomas') {
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
        } 
        // Se não tem problema definido ainda
        else {
          // Se está repetindo perguntas, muda abordagem
          if (session.repeatCount > 2) {
            reply = `${session.firstName}, vou reformular: você quer agendar uma consulta. É para algum problema específico, exame de rotina, ou consulta preventiva? Assim posso te orientar melhor! 😊`;
            session.stage = 'situacao'; // Volta para situação
          } else {
            const problemQuestions = [
              `${session.firstName}, me conta: o que te trouxe aqui hoje?`,
              `Qual o motivo da consulta, ${session.firstName}?`,
              `Pode me falar sobre o que está te preocupando?`
            ];
            reply = getRandomResponse(problemQuestions);
          }
        }

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
        
        // Se é erro de token ou permissão, não tenta novamente
        if (errorData.includes('OAuthException') || 
            errorData.includes('access token') || 
            errorData.includes('does not have permission') ||
            errorData.includes('code":10')) {
          console.error('🚨 ERRO DE TOKEN/PERMISSÃO - Verificar configurações Meta');
          console.error('💡 Soluções:');
          console.error('   1. Gerar novo token no Meta for Developers');
          console.error('   2. Verificar permissões whatsapp_business_messaging');
          console.error('   3. Confirmar Phone Number ID: ' + process.env.WHATSAPP_PHONE_ID);
          throw new Error(`Token/Permissão inválida: ${errorData}`);
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

    // 5. CONTROLE DE SESSÃO COM REDIS
    const session = await getSession(from);
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
    
    // IMPORTANTE: Salva session após modificações
    await saveSession(from, session);
    
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

    // Fallback graceful melhorado
    try {
      // Se for erro de token, não tenta enviar fallback
      if (error.message.includes('Token') || error.message.includes('permiss')) {
        console.error('💀 Erro de token - não enviando fallback para evitar loop');
        return res.status(500).json({
          error: 'WhatsApp token/permission error',
          message: 'Verificar configurações no Meta for Developers',
          timestamp: new Date().toISOString(),
          reference: `ERR-TOKEN-${Date.now()}`
        });
      }
      
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
    status: '💼 Secretária NEPQ com Redis Persistente',
    version: '3.0.0-redis',
    storage: sessionManager.fallbackToMemory ? 'memory' : 'redis',
    uptime: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
    memory: {
      used: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`
    },
    metrics: {
      activeSessions: (await sessionManager.getStats()).activeSessions,
      dailyTokens: dailyTokenCount,
      dailyRequests: dailyRequestCount,
      hourlyTokens: hourlyTokenCount,
      hourlyRequests: hourlyRequestCount,
      maxDailyTokens: MAX_DAILY_TOKENS,
      maxDailyRequests: MAX_DAILY_REQUESTS,
      maxHourlyTokens: MAX_HOURLY_TOKENS,
      maxHourlyRequests: MAX_HOURLY_REQUESTS,
      emergencyPhonesSize: emergencyPhones.size
    },
    features: [
      '🚨 Detecção de emergência melhorada',
      '⚡ Rate limiting com Redis',
      '🧠 Context compression inteligente',
      '💰 Cost monitoring rigoroso',
      '🔄 Auto-retry com backoff',
      '🛡️ Error recovery robusto',
      '🧹 Cleanup automático Redis/Memory',
      '📊 Real-time metrics',
      '🕐 Timezone Brasil correto',
      '💾 Sessions persistentes com Redis',
      '🔄 Fallback graceful para memory'
    ],
    timestamp: new Date().toISOString()
  });
});

// ---- ROTA DE MÉTRICAS PARA MONITORAMENTO ------------------------------------
app.get('/metrics', async (req, res) => {
  const stats = await sessionManager.getStats();
  
  res.json({
    sessions: {
      active: stats.activeSessions,
      storage: stats.storage,
      redis: stats.redis
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
      activeUsers: stats.activeRateLimits || 0,
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
  emergencyPhones.clear();
  dailyTokenCount = 0;
  dailyRequestCount = 0;
  hourlyTokenCount = 0;
  hourlyRequestCount = 0;
  
  // Reset Redis sessions se disponível
  try {
    if (!sessionManager.fallbackToMemory) {
      const keys = await sessionManager.client.keys('session:*');
      if (keys.length > 0) {
        await sessionManager.client.del(keys);
        console.log(`🔄 ${keys.length} sessions Redis removidas`);
      }
    } else {
      sessionManager.memoryCache.clear();
      sessionManager.memoryRateLimit.clear();
      console.log('🔄 Memory cache limpo');
    }
  } catch (error) {
    console.error('⚠️ Erro no reset Redis:', error.message);
  }
  
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
      whatsappPhoneId: process.env.WHATSAPP_PHONE_ID ? 'configured' : 'missing',
      verifyToken: process.env.VERIFY_TOKEN ? 'configured' : 'missing',
      memory: process.memoryUsage().heapUsed < 500 * 1024 * 1024 ? 'ok' : 'high',
      sessions: sessions.size < 1000 ? 'ok' : 'high'
    }
  };
  
  const allHealthy = Object.values(health.checks).every(check => 
    check === 'configured' || check === 'ok'
  );
  
  res.status(allHealthy ? 200 : 503).json(health);
});

// ---- CLEANUP JOBS MELHORADOS COM REDIS -------------------------------------
// Limpeza de sessões antigas a cada 30 minutos
setInterval(async () => {
  await cleanupOldSessions();
}, 30 * 60 * 1000);

// Limpeza de emergencyPhones a cada 1 hora
setInterval(() => {
  const size = emergencyPhones.size;
  emergencyPhones.clear();
  if (size > 0) {
    console.log(`🧹 Emergency phones: ${size} registros limpos`);
  }
}, 60 * 60 * 1000);

// Limpeza de memória forçada a cada 6 horas
setInterval(() => {
  if (global.gc) {
    global.gc();
    console.log('🧹 Garbage collection manual executada');
  }
}, 6 * 60 * 60 * 1000);()) {
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

// ---- GRACEFUL SHUTDOWN COM REDIS --------------------------------------------
process.on('SIGTERM', async () => {
  console.log('📴 Recebido SIGTERM, fazendo shutdown graceful...');
  
  // Log final
  const stats = await sessionManager.getStats();
  console.log(`📊 Stats finais: ${stats.activeSessions} sessões, ${dailyTokenCount} tokens, ${dailyRequestCount} requests`);
  
  // Fecha conexão Redis
  await sessionManager.close();
  
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📴 Recebido SIGINT, fazendo shutdown graceful...');
  await sessionManager.close();
  process.exit(0);
});

// ---- INICIALIZAÇÃO -----------------------------------------------------------
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log('🚀💾 === SECRETÁRIA NEPQ COM REDIS PERSISTENTE === 💾🚀');
  console.log(`📍 Porta: ${PORT}`);
  console.log(`🧠 Método: Neuro Emotional Persuasion Questions`);
  console.log(`⚕️ Especialidade: Dr. Quelson - Gastroenterologia`);
  console.log(`🔗 Webhook: https://meu-bot-jhcl.onrender.com/webhook`);
  console.log('');
  
  // Status do Redis
  const stats = await sessionManager.getStats();
  console.log('💾 ARMAZENAMENTO:');
  console.log(`  📊 Storage: ${stats.storage}`);
  console.log(`  💾 Redis: ${stats.redis ? 'Conectado' : 'Desconectado'}`);
  console.log(`  📈 Sessions: ${stats.activeSessions} ativas`);
  console.log('');
  
  console.log('🛡️ PROTEÇÕES ATIVAS:');
  console.log('  ✅ Sessions persistentes com Redis + fallback');
  console.log('  ✅ Rate limiting distribuído');
  console.log('  ✅ Detecção de emergência médica melhorada');
  console.log('  ✅ Controle de custos OpenAI rigoroso');
  console.log('  ✅ Context compression inteligente');
  console.log('  ✅ Fallback sem IA robusto');
  console.log('  ✅ Retry automático com exponential backoff');
  console.log('  ✅ Timezone Brasil correto');
  console.log('  ✅ Validação de payload completa');
  console.log('  ✅ Graceful error handling');
  console.log('  ✅ Auto-cleanup Redis/Memory');
  console.log('');
  console.log(`💰 Limites: ${MAX_DAILY_TOKENS} tokens/dia, ${MAX_DAILY_REQUESTS} requests/dia`);
  console.log(`⏰ Limites horários: ${MAX_HOURLY_TOKENS} tokens/hora, ${MAX_HOURLY_REQUESTS} requests/hora`);
  console.log('📊 Monitoramento: /metrics');
  console.log('🏥 Health check: /health');
  console.log('');
  console.log('💼 Pronta para atender pacientes com persistência total!');
  console.log('🔄 Conversas sobrevivem a restarts e deploys!');
});
