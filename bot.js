// bot.js - Secretária NEPQ com Redis Persistente - VERSÃO CORRIGIDA
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

// ---- GERAÇÃO DE RESPOSTA BLINDADA - CORRIGIDA ------------------------------
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
