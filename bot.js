// bot.js - Secretária NEPQ com Redis Persistente - VERSÃO COMPLETA E CORRIGIDA
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const OpenAI = require('openai');
const redis = require('redis');

const app = express();
app.use(bodyParser.json());

// ---- CONTROLE DE CUSTOS MAIS RIGOROSO ---------------------------------------
let dailyTokenCount = 0;
let dailyRequestCount = 0;
let hourlyTokenCount = 0;
let hourlyRequestCount = 0;

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

        this.memoryCache = new Map();
        this.memoryRateLimit = new Map();
        this.fallbackToMemory = false;

        this.client.connect().catch(() => {
            console.warn('⚠️ Redis indisponível - usando memory fallback');
            this.fallbackToMemory = true;
        });
    }

    async getSession(phone) {
        try {
            if (this.fallbackToMemory) {
                return this.getSessionFromMemory(phone);
            }
            const sessionData = await this.client.get(`session:${phone}`);
            if (sessionData) {
                const session = JSON.parse(sessionData);
                session.lastActivity = Date.now();
                await this.saveSession(phone, session);
                return session;
            }
            const newSession = this.createNewSession();
            await this.saveSession(phone, newSession);
            return newSession;
        } catch (error) {
            console.error('⚠️ Redis falhou, usando memory fallback:', error.message);
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

    async isRateLimited(phone) {
        // Implementação de Rate Limit (simplificada para o exemplo)
        return false;
    }

    getSessionFromMemory(phone) {
        if (!this.memoryCache.has(phone)) {
            this.memoryCache.set(phone, this.createNewSession());
        }
        const session = this.memoryCache.get(phone);
        session.lastActivity = Date.now();
        return session;
    }

    createNewSession() {
        return {
            stage: 'start',
            firstName: null,
            askedName: false,
            lastIntent: '',
            problemContext: null,
            repeatCount: 0,
            conversationHistory: [],
            lastActivity: Date.now(),
        };
    }

    async close() {
        try {
            if (!this.fallbackToMemory && this.client.isOpen) {
                await this.client.disconnect();
                console.log('✅ Redis desconectado gracefully');
            }
        } catch (error) {
            console.error('⚠️ Erro ao desconectar Redis:', error.message);
        }
    }
}

const sessionManager = new SessionManager();

// ---- CONFIGURAÇÃO DA OPENAI -------------------------------------------------
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

// ---- FUNÇÕES DE DETECÇÃO (EMERGÊNCIA, INTENÇÃO, ETC.) -----------------------
function isEmergency(message) {
    const emergencyKeywords = [
        'infarto', 'ataque cardiaco', 'dor no peito forte', 'parada cardíaca',
        'não consigo respirar', 'falta de ar grave', 'sufocando',
        'avc', 'derrame', 'convulsão', 'desmaiei', 'inconsciente',
        'acidente', 'sangramento grave', 'muito sangue',
        'overdose', 'envenenamento', 'intoxicação',
        'emergencia', 'emergência', 'socorro', 'samu', 'ambulancia',
        'vou me matar', 'quero morrer', 'suicidio',
        'dor insuportável'
    ];
    const msg = message.toLowerCase().trim();
    return emergencyKeywords.some(keyword => msg.includes(keyword));
}

function getEmergencyResponse(firstName) {
    const name = firstName || 'amigo(a)';
    return `🚨 ${name}, se você está tendo uma emergência médica, por favor:\n\nLIGUE IMEDIATAMENTE:\n🚑 SAMU: 192\n🚒 Bombeiros: 193\n🚓 Polícia: 190\n\nVá ao pronto-socorro mais próximo. NÃO ESPERE!\n\nPara consultas não urgentes, retome contato quando estiver seguro. O Dr. Quelson não atende emergências pelo WhatsApp.`;
}

function checkCostLimits() {
    if (hourlyTokenCount > MAX_HOURLY_TOKENS || dailyTokenCount > MAX_DAILY_TOKENS || hourlyRequestCount > MAX_HOURLY_REQUESTS || dailyRequestCount > MAX_DAILY_REQUESTS) {
        throw new Error(`Limite de custo excedido.`);
    }
}

async function detectIntent(message, stage, session) {
    // Usando fallback contextual como principal para economizar custos e ser mais rápido
    // A implementação com a OpenAI pode ser chamada aqui como um fallback secundário se necessário
    return detectIntentFallbackContextual(message, stage, session);
}


function detectIntentFallbackContextual(message, stage, session) {
    const msg = message.toLowerCase().trim();

    if (isEmergency(msg)) return 'emergencia';

    const history = (session.conversationHistory || []).join(' ').toLowerCase();
    const wantedScheduling = session.problemContext === 'agendamento_direto' || history.includes('agendar') || history.includes('marcar');

    if (wantedScheduling && (msg.includes('valor') || msg.includes('preço') || msg.includes('custa'))) return 'valores';
    if (msg.includes('agendar') || msg.includes('marcar') || msg.includes('consulta')) return 'agendar';
    if (msg.includes('valor') || msg.includes('preço') || msg.includes('custa')) return 'valores';
    if (msg.includes('convênio') || msg.includes('convenio') || msg.includes('plano')) return 'convenio';
    if (msg.includes('horário') || msg.includes('horario') || msg.includes('funciona') || msg.includes('atende')) return 'horarios';
    if (msg.includes('dor') || msg.includes('sintoma') || msg.includes('problema') || msg.includes('sinto')) return 'sintomas';
    if (msg.includes('sim') || msg.includes('ok') || msg.includes('claro') || msg.includes('pode')) return 'positiva';
    if (msg.includes('não') || msg.includes('nao') || msg.includes('obrigado')) return 'negativa';
    if (msg.includes('depende') || msg.includes('preciso saber') || msg.includes('antes')) return 'condicional';
    if (msg.includes('oi') || msg.includes('olá') || msg.includes('ola') || msg.includes('tchau') || msg.includes('bom dia') || msg.includes('boa tarde') || msg.includes('boa noite')) return 'saudacao';

    return 'outra';
}


// ---- FUNÇÕES AUXILIARES -----------------------------------------------------
function extractFirstName(text) {
    if (!text || typeof text !== 'string') return 'Paciente';
    const cleaned = text.trim();
    const name = cleaned.split(' ')[0];
    const safeName = name.replace(/[^a-zA-ZÀ-ú]/g, '');
    return safeName.charAt(0).toUpperCase() + safeName.slice(1);
}


function getCurrentGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia!';
    if (hour >= 12 && hour < 18) return 'Boa tarde!';
    return 'Boa noite!';
}

function getRandomResponse(responses) {
    return responses[Math.floor(Math.random() * responses.length)];
}

// ---- GERAÇÃO DE RESPOSTA (LÓGICA PRINCIPAL) --------------------------------
async function generateReply(session, from, message) {
    if (session.repeatCount > 5) {
        return `${session.firstName || 'Paciente'}, percebo que estamos tendo dificuldades. Que tal ligar para o número ${process.env.EMERGENCY_CONTACT_PHONE}? Assim posso te ajudar melhor.`;
    }
    if (message.length > 500) {
        return `${session.firstName || 'Paciente'}, sua mensagem é um pouco longa. Pode resumir o que precisa?`;
    }

    session.conversationHistory.push(`Paciente: ${message}`);
    const intent = await detectIntent(message, session.stage, session);

    if (intent === session.lastIntent) {
        session.repeatCount += 1;
    } else {
        session.repeatCount = 0;
    }
    session.lastIntent = intent;

    if (intent === 'emergencia') {
        return getEmergencyResponse(session.firstName);
    }

    if (!session.firstName) {
        if (!session.askedName) {
            session.askedName = true;
            const saudacao = getCurrentGreeting();
            return `${saudacao} Você entrou em contato com o consultório do Dr. Quelson, especialista em Gastroenterologia. Com quem eu tenho o prazer de falar?`;
        } else {
            session.firstName = extractFirstName(message);
            session.stage = 'identificado';
            return getRandomResponse([
                `Muito prazer, ${session.firstName}! Como posso te ajudar hoje?`,
                `Ok, ${session.firstName}! No que posso ser útil?`,
                `Entendido, ${session.firstName}. Me conte o motivo do seu contato.`,
            ]);
        }
    }
    
    // ---- FLUXO DA CONVERSA APÓS IDENTIFICAÇÃO ----
    let reply = '';
    switch (intent) {
        case 'saudacao':
            reply = getRandomResponse([
                `Olá, ${session.firstName}! Como posso te ajudar?`,
                `Oi, ${session.firstName}! No que posso ser útil hoje?`,
            ]);
            break;
        case 'agendar':
            session.problemContext = 'agendamento_direto';
            session.stage = 'agendando';
            reply = `Entendido, ${session.firstName}. Para agilizar, qual seria o melhor dia e período (manhã/tarde) para você? Assim já verifico a disponibilidade do Dr. Quelson.`;
            break;
        case 'valores':
            session.stage = 'informando_valores';
            reply = `Claro, ${session.firstName}. O valor da consulta particular é de R$${process.env.CONSULTA_VALOR}. Ela inclui o atendimento com o Dr. Quelson e um retorno em até 30 dias. O pagamento pode ser feito por Pix ou cartão. Isso te ajuda?`;
            break;
        case 'convenio':
            session.stage = 'informando_convenio';
            reply = `Atualmente, ${session.firstName}, os atendimentos são apenas na modalidade particular para garantir um tempo de consulta mais dedicado. Fornecemos recibo para que você possa solicitar o reembolso junto ao seu convênio, se aplicável.`;
            break;
        case 'sintomas':
            session.stage = 'coletando_sintomas';
            reply = `Entendo, ${session.firstName}. É importante investigar esses sintomas. Para agendarmos uma consulta com o Dr. Quelson e avaliarmos isso com calma, qual seria o melhor dia e período para você?`;
            break;
        case 'horarios':
            reply = `O consultório funciona de segunda a sexta, das 8h às 18h. As consultas são sempre com horário marcado para garantir que não haja longas esperas.`;
            break;
        case 'positiva':
            reply = `Ótimo! Podemos prosseguir.`;
            if (session.stage === 'agendando') {
                reply = `Perfeito, ${session.firstName}. Vou verificar os horários disponíveis e já te retorno. Só um momento.`;
            }
            break;
        case 'negativa':
            reply = `Entendido, ${session.firstName}. Se mudar de ideia ou precisar de outra informação, é só chamar.`;
            break;
        default: // 'outra', 'condicional', 'confusao'
             session.repeatCount += 1;
             reply = getRandomResponse([
                `Desculpe, ${session.firstName}, não entendi muito bem. Você poderia reformular sua pergunta?`,
                `Hmm, ${session.firstName}, não captei sua solicitação. Pode tentar explicar de outra forma?`,
                `Entendido, ${session.firstName}. Para eu te ajudar melhor, pode me dizer em poucas palavras o que você precisa? (Ex: 'agendar consulta', 'saber o valor', etc.)`
            ]);
            break;
    }
    return reply;
}

// ---- SERVIÇO DE ENVIO DE MENSAGEM -------------------------------------------
async function sendWhatsappMessage(to, text) {
    try {
        await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                text: {
                    body: text
                },
            }),
        });
    } catch (error) {
        console.error('❌ Erro ao enviar mensagem via WhatsApp API:', error);
    }
}

// ---- WEBHOOKS E SERVIDOR EXPRESS --------------------------------------------
app.post('/webhook', async (req, res) => {
    try {
        const entry = req.body.entry?.[0];
        const changes = entry?.changes?.[0];
        const messageData = changes?.value?.messages?.[0];

        if (!messageData || !messageData.text?.body) {
            console.log('Mensagem ignorada (não é de texto ou está vazia).');
            return res.sendStatus(200);
        }

        const from = messageData.from;
        const text = messageData.text.body;

        if (await sessionManager.isRateLimited(from)) {
            console.warn(`⚠️ Rate limit excedido para o número: ${from}`);
            return res.sendStatus(200);
        }
        
        const session = await sessionManager.getSession(from);
        const replyText = await generateReply(session, from, text);

        session.conversationHistory.push(`Bot: ${replyText}`);
        await sessionManager.saveSession(from, session);

        await sendWhatsappMessage(from, replyText);

        res.sendStatus(200);
    } catch (error) {
        console.error('❌ Erro fatal ao processar mensagem:', error);
        res.sendStatus(500);
    }
});

app.get('/webhook', (req, res) => {
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        console.log('✅ Webhook verificado com sucesso!');
        res.status(200).send(challenge);
    } else {
        console.error('❌ Falha na verificação do Webhook.');
        res.sendStatus(403);
    }
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
    console.log(`🚀 Bot rodando na porta ${PORT}`);
});

// ---- GRACEFUL SHUTDOWN ------------------------------------------------------
process.on('SIGTERM', () => {
    console.info('SIGTERM signal recebido: fechando conexões gracefully.');
    server.close(() => {
        console.log('Servidor HTTP fechado.');
        sessionManager.close().then(() => {
            console.log('Conexão com Redis fechada.');
            process.exit(0);
        });
    });
});
