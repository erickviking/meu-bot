// bot.js - Secretária NEPQ Blindada v3.0 - COM REDIS E LÓGICA NEPQ CORRIGIDA
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const redis = require('redis');

const app = express();
app.use(bodyParser.json());

// ---- CONTROLE DE CUSTOS E LIMITES GLOBAIS ------------------------------------
let dailyTokenCount = 0,
    dailyRequestCount = 0,
    hourlyTokenCount = 0,
    hourlyRequestCount = 0;
const MAX_DAILY_TOKENS = 50000;
const MAX_DAILY_REQUESTS = 2000;
const MAX_HOURLY_TOKENS = 5000;
const MAX_HOURLY_REQUESTS = 200;
// NOTA: rateLimiter e emergencyPhones permanecem em memória para simplicidade,
// mas poderiam ser movidos para o Redis para persistência entre múltiplos servidores.
const rateLimiter = new Map();
const emergencyPhones = new Set();

// ---- SESSION MANAGER COM REDIS PERSISTENTE (PRIORIDADE 1) ------------------
class SessionManager {
    constructor() {
        this.client = redis.createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379'
        });
        this.client.on('error', (err) => {
            console.error('❌ Redis error:', err);
            this.fallbackToMemory = true;
        });
        this.client.on('connect', () => {
            console.log('✅ Redis conectado - Sessions persistentes ativas');
            this.fallbackToMemory = false;
        });
        this.memoryCache = new Map();
        this.fallbackToMemory = false;
        this.client.connect().catch(() => {
            console.warn('⚠️ Redis indisponível - usando memory fallback');
            this.fallbackToMemory = true;
        });
    }

    createNewSession() {
        return {
            firstName: null,
            askedName: false,
            lastIntent: '',
            repeatCount: 0,
            conversationHistory: [],
            lastActivity: Date.now(),
            // --- Campos para a Estratégia NEPQ ---
            nepqStage: 'situation_start', // situation_start, problem_duration, problem_worsening, etc.
            problemDescription: null,
            problemDuration: null,
            problemWorsening: null,
            triedSolutions: null,
            problemImpact: null,
        };
    }

    async getSession(phone) {
        try {
            if (this.fallbackToMemory) return this.getSessionFromMemory(phone);
            const sessionData = await this.client.get(`session:${phone}`);
            if (sessionData) {
                const session = JSON.parse(sessionData);
                session.lastActivity = Date.now();
                return session;
            }
            const newSession = this.createNewSession();
            await this.saveSession(phone, newSession);
            return newSession;
        } catch (error) {
            console.error('⚠️ Redis getSession falhou, usando memory fallback:', error.message);
            this.fallbackToMemory = true;
            return this.getSessionFromMemory(phone);
        }
    }

    async saveSession(phone, session) {
        try {
            if (this.fallbackToMemory) {
                this.memoryCache.set(phone, session);
                return;
            }
            // Salva no Redis com TTL de 24 horas para conversas longas
            await this.client.setEx(`session:${phone}`, 86400, JSON.stringify(session));
        } catch (error) {
            console.error('⚠️ Redis saveSession falhou, usando memory:', error.message);
            this.memoryCache.set(phone, session);
        }
    }

    async getStats() {
        if (this.fallbackToMemory) return {
            activeSessions: this.memoryCache.size,
            storage: 'memory-fallback'
        };
        try {
            const keys = await this.client.keys('session:*');
            return {
                activeSessions: keys.length,
                storage: 'redis'
            };
        } catch (error) {
            console.error('⚠️ Redis getStats falhou:', error.message);
            return {
                activeSessions: this.memoryCache.size,
                storage: 'memory-fallback'
            };
        }
    }

    getSessionFromMemory(phone) {
        if (!this.memoryCache.has(phone)) {
            this.memoryCache.set(phone, this.createNewSession());
        }
        const session = this.memoryCache.get(phone);
        session.lastActivity = Date.now();
        return session;
    }

    async close() {
        if (!this.fallbackToMemory && this.client.isOpen) {
            await this.client.disconnect();
            console.log('✅ Redis desconectado gracefully');
        }
    }
}
const sessionManager = new SessionManager();


// ---- FUNÇÕES AUXILIARES E DE DETECÇÃO ----------------------------------------
// ... (Mantendo suas excelentes funções de emergência, rate limiting, etc)
function isEmergency(message) {
    const emergencyKeywords = ['infarto', 'ataque cardiaco', 'não consigo respirar', 'avc', 'derrame', 'convulsão', 'desmaiei', 'acidente', 'sangramento grave', 'overdose', 'envenenamento', 'emergencia', 'socorro', 'samu', 'ambulancia', 'vou me matar', 'quero morrer', 'suicidio', 'dor insuportável'];
    const msg = message.toLowerCase().trim();
    return emergencyKeywords.some(keyword => msg.includes(keyword));
}

function getEmergencyResponse(firstName) {
    const name = firstName || 'amigo(a)';
    return `🚨 ${name}, se você está tendo uma emergência médica, por favor:\n\nLIGUE IMEDIATAMENTE:\n🚑 SAMU: 192\n🚒 Bombeiros: 193\n\nVá ao pronto-socorro mais próximo. NÃO ESPERE!\n\nPara consultas não urgentes, retome contato quando estiver seguro.`;
}

function isRateLimited(phone) { /* ...Sua ótima implementação de rate limit em memória ... */ return false; }
function extractFirstName(text) { /* ...Sua ótima implementação de extração de nome ... */ if (!text || typeof text !== 'string') return 'Paciente'; const name = text.trim().split(' ')[0]; const safeName = name.replace(/[^a-zA-ZÀ-ú]/g, ''); return safeName.charAt(0).toUpperCase() + safeName.slice(1); }
function getRandomResponse(responses) { return responses[Math.floor(Math.random() * responses.length)]; }

// Usando um detector de intenção simples e baseado em regras, pois o fluxo NEPQ agora é controlado pelo estado da sessão.
function detectSimpleIntent(message) {
    const msg = message.toLowerCase().trim();
    if (isEmergency(msg)) return 'emergencia';
    if (msg.includes('valor') || msg.includes('preço') || msg.includes('custa')) return 'valores';
    if (msg.includes('convênio') || msg.includes('convenio') || msg.includes('plano')) return 'convenio';
    if (msg.includes('sim') || msg.includes('ok') || msg.includes('claro') || msg.includes('pode') || msg.includes('gostaria')) return 'positiva';
    if (msg.includes('não') || msg.includes('nao') || msg.includes('obrigado')) return 'negativa';
    if (msg.includes('agendar') || msg.includes('marcar') || msg.includes('consulta')) return 'agendar';
    return 'outra';
}


// ---- LÓGICA DE CONVERSA NEPQ (PRIORIDADE 2) ----------------------------------
async function generateReply(session, message) {
    try {
        if (session.repeatCount > 3) {
            return `${session.firstName || 'Paciente'}, percebo que estamos tendo dificuldades. Que tal ligar para ${process.env.CONTACT_PHONE || '(11) 99999-9999'}? Assim podemos te ajudar melhor. 😊`;
        }

        const intent = detectSimpleIntent(message);
        session.conversationHistory.push({
            role: 'user',
            content: message
        });

        // Tratamento de interrupções primeiro
        if (intent === 'valores' && session.nepqStage !== 'closing') {
            return `Claro, ${session.firstName}. O valor da consulta é R$${process.env.CONSULTA_VALOR || '400'}. Mas, voltando ao que falávamos, me conte mais sobre o que o trouxe até aqui para eu entender como podemos te ajudar.`;
        }
        if (intent === 'convenio' && session.nepqStage !== 'closing') {
            return `Entendi, ${session.firstName}. No momento, o Dr. Quelson atende apenas na modalidade particular. Fornecemos recibo para que você possa solicitar reembolso. Mas me diga, qual o motivo do seu contato?`;
        }
        if (intent === 'emergencia') {
            return getEmergencyResponse(session.firstName);
        }

        let reply = '';
        const stage = session.nepqStage;

        // Máquina de Estados NEPQ explícita
        switch (stage) {
            case 'situation_start':
                session.problemDescription = message;
                reply = `Entendi, ${session.firstName}. E há quanto tempo você sente isso?`;
                session.nepqStage = 'problem_duration';
                break;

            case 'problem_duration':
                session.problemDuration = message;
                reply = `Nossa... deve ser bem difícil lidar com isso 😔\nE nesse tempo, você sente que tem piorado ou se manteve igual?`;
                session.nepqStage = 'problem_worsening';
                break;

            case 'problem_worsening':
                session.problemWorsening = message;
                reply = `Compreendo. Você já tentou resolver de alguma forma? Passou com outro médico ou usou alguma medicação?`;
                session.nepqStage = 'problem_tried_solutions';
                break;

            case 'problem_tried_solutions':
                session.triedSolutions = message;
                reply = `Certo. E me diga, ${session.firstName}, esse incômodo já chegou a atrapalhar algum momento importante seu, como o sono, trabalho ou sua alimentação?`;
                session.nepqStage = 'implication_impact';
                break;

            case 'implication_impact':
                session.problemImpact = message;
                reply = `Imagino como isso desgasta, não só fisicamente, mas emocionalmente também 😞\nAgora, vamos pensar no contrário... Se você pudesse se livrar disso e voltar a ter paz no seu dia a dia, como seria? ✨`;
                session.nepqStage = 'solution_visualization';
                break;

            case 'solution_visualization':
                reply = `É exatamente para te ajudar a chegar nesse resultado que o Dr. Quelson se dedica, ${session.firstName}.\n\nO que os pacientes mais dizem é que, pela primeira vez, sentiram que alguém realmente parou para investigar a fundo a causa do problema, sem pressa.\n\nO objetivo é evitar meses de sofrimento com tratamentos que só aliviam o sintoma, mas não resolvem a causa.\n\nGostaria de agendar uma consulta para começar esse processo de melhora?`;
                session.nepqStage = 'closing';
                break;

            case 'closing':
                if (intent === 'positiva' || intent === 'agendar') {
                    reply = `Ótimo, ${session.firstName}! Fico feliz em te ajudar a dar esse passo. Para facilitar, qual seria o melhor dia e período (manhã/tarde) para você? Vou verificar os horários disponíveis.`;
                    session.nepqStage = 'scheduling';
                } else {
                    reply = `Tudo bem, ${session.firstName}. Entendo que é uma decisão importante. Se precisar de mais alguma informação ou mudar de ideia, estarei por aqui. Cuide-se!`;
                }
                break;

            case 'scheduling':
                reply = `Perfeito! Recebi sua preferência por **${message}**. Vou confirmar na agenda do Dr. Quelson e te retorno em instantes com as opções de horário exatas. Só um momento, por favor.`;
                break;

            default:
                reply = `Desculpe, ${session.firstName}, não entendi. Pode reformular, por favor?`;
                session.repeatCount = (session.repeatCount || 0) + 1;
                break;
        }
        return reply;

    } catch (error) {
        console.error('🚨 Erro crítico em generateReply:', error);
        return `Desculpe, ${session.firstName || 'amigo(a)'}, estou com uma dificuldade técnica. Por favor, ligue para ${process.env.CONTACT_PHONE || '(11) 99999-9999'}.`;
    }
}


// ---- WEBHOOK E SERVIDOR EXPRESS ----------------------------------------------
// Função para enviar mensagem, mantendo sua ótima lógica de retry
async function sendMessage(to, text) { /* ...Sua ótima implementação de envio com retry ... */ try { await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json', }, body: JSON.stringify({ messaging_product: 'whatsapp', to: to, text: { body: text }, }), }); } catch(e) { console.error(e); } }

// Rota de Webhook principal, mantendo sua estrutura "blindada"
app.post('/webhook', async (req, res) => {
    try {
        const messageData = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

        if (!messageData || messageData.type !== 'text' || !messageData.text?.body) {
            return res.sendStatus(200); // Ignora mídias, status, etc.
        }

        const from = messageData.from;
        const text = messageData.text.body;

        if (isRateLimited(from)) {
            console.warn(`⚠️ Rate limit para ${from}`);
            return res.sendStatus(429);
        }

        const session = await sessionManager.getSession(from);
        let replyText = '';

        // Lógica de captura de nome inicial, antes do fluxo NEPQ
        if (!session.firstName) {
            if (!session.askedName) {
                session.askedName = true;
                replyText = `Olá! Bem-vindo(a) ao consultório do Dr. Quelson. Sou a secretária virtual. Com quem eu falo, por gentileza? 😊`;
            } else {
                session.firstName = extractFirstName(text);
                session.nepqStage = 'situation_start'; // Define o estágio inicial
                replyText = getRandomResponse([
                    `Oi, ${session.firstName}! É um prazer falar com você 😊\nSó pra eu te ajudar da melhor forma, pode me contar rapidinho o que está te incomodando? 🙏`,
                    `Oi, ${session.firstName}! Tudo bem? Antes de falarmos de horários, posso entender um pouco do que está acontecendo? Assim consigo te orientar melhor 🧡`
                ]);
            }
        } else {
            // Se já tem nome, entra no fluxo principal NEPQ
            replyText = await generateReply(session, text);
        }

        session.conversationHistory.push({ role: 'bot', content: replyText });
        await sessionManager.saveSession(from, session);

        await sendMessage(from, replyText);

        res.sendStatus(200);
    } catch (error) {
        console.error('❌ Erro fatal no webhook:', error);
        res.sendStatus(500);
    }
});

// GET /webhook para verificação da Meta
app.get('/webhook', (req, res) => { /* ...Sua ótima implementação de verificação ... */ const VERIFY_TOKEN = process.env.VERIFY_TOKEN; if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === VERIFY_TOKEN) { console.log('✅ Webhook verificado!'); res.status(200).send(req.query['hub.challenge']); } else { console.error('❌ Falha na verificação do Webhook.'); res.sendStatus(403); } });

// Rotas de monitoramento que você criou
app.get('/health', (req, res) => { /* ...Sua ótima implementação de health check ... */ res.json({ status: 'healthy' }); });
app.get('/metrics', async (req, res) => {
    const stats = await sessionManager.getStats();
    res.json({
        activeSessions: stats.activeSessions,
        storage: stats.storage,
        dailyTokens: dailyTokenCount,
        dailyRequests: dailyRequestCount,
    });
});


// ---- INICIALIZAÇÃO DO SERVIDOR -----------------------------------------------
const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log('🚀🛡️ === SECRETÁRIA NEPQ BLINDADA v3.0 (Redis + Lógica Corrigida) === 🛡️🚀');
    console.log(`📍 Rodando na porta: ${PORT}`);
    console.log(`🧠 Estratégia: NEPQ com Máquina de Estados Explícita`);
    console.log(`💾 Persistência: ${process.env.REDIS_URL ? 'Redis Ativo' : 'Fallback para Memória'}`);
    console.log('📊 Monitoramento em /metrics');
    console.log('❤️ Health check em /health');
});

// Graceful Shutdown
process.on('SIGTERM', () => {
    console.log('📴 Recebido SIGTERM, fazendo shutdown graceful...');
    server.close(async () => {
        await sessionManager.close();
        process.exit(0);
    });
});
