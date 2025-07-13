// src/services/sessionManager.js
const redis = require('redis');
const config = require('../config');
const logger = require('../utils/logger');
// Importa o nosso novo serviço e o cliente Supabase
const clinicService = require('./clinic.service');

class SessionManager {
    constructor() {
        this.client = redis.createClient({ url: config.redisUrl });
        this.client.on('error', (err) => {
            logger.error('❌ Redis error:', err);
            this.fallbackToMemory = true;
        });
        this.client.on('connect', () => {
            logger.info('✅ Redis conectado - Sessions persistentes ativas');
            this.fallbackToMemory = false;
        });
        this.memoryCache = new Map();
        this.fallbackToMemory = false;
        this.client.connect().catch(() => {
            logger.warn('⚠️ Redis indisponível - usando memory fallback');
            this.fallbackToMemory = true;
        });
    }

     createNewSession() {
        return {
            firstName: null,
            onboardingState: 'start', // Podemos manter para o onboarding inicial
            state: 'onboarding', // O NOVO ESTADO PRINCIPAL!
            conversationHistory: [],
            messageBuffer: [],
            clinicConfig: null,
        };
    }

    async resetSession(from) {
        const newSession = this.createNewSession();
        await this.saveSession(from, newSession);
    }

    async getSession(phone) {
        let session;
        try {
            if (this.fallbackToMemory) {
                session = this.getSessionFromMemory(phone);
            } else {
                const sessionData = await this.client.get(`session:${phone}`);
                session = sessionData ? JSON.parse(sessionData) : this.createNewSession();
            }

            // Garante que sessões antigas tenham os novos campos
            if (!session.onboardingState) session.onboardingState = session.firstName ? 'complete' : 'start';
            if (!session.messageBuffer) session.messageBuffer = [];

            // ### INÍCIO DA LÓGICA MULTI-TENANT ###
            // Se a configuração da clínica ainda não foi carregada para esta sessão...
            if (!session.clinicConfig) {
                logger.info(`[Multi-Tenant] Configuração da clínica não encontrada para ${phone}. Buscando...`);
                
                // O ID do número do seu bot deve vir do seu arquivo de configuração
                const botWhatsappId = config.whatsapp.phoneId;
                const clinicConfig = await clinicService.getClinicConfigByWhatsappId(botWhatsappId);

                if (clinicConfig) {
                    logger.info(`[Multi-Tenant] Clínica "${clinicConfig.doctorName}" carregada para a sessão.`);
                    session.clinicConfig = clinicConfig;
                    // Salva a sessão enriquecida de volta no Redis para futuras requisições
                    await this.saveSession(phone, session);
                } else {
                    // CASO CRÍTICO: Não há clínica cadastrada para este número de bot.
                    // O sistema não pode operar sem isso.
                    logger.error(`🚨 CRÍTICO: Nenhuma clínica encontrada para o whatsapp_phone_id: ${botWhatsappId}. Verifique o banco de dados.`);
                    // Retornar a sessão sem a config fará com que o sistema falhe de forma controlada mais adiante.
                }
            }
            // ### FIM DA LÓGICA MULTI-TENANT ###

            return session;

        } catch (error) {
            logger.error('⚠️ Redis getSession falhou:', error.message);
            this.fallbackToMemory = true;
            return this.getSessionFromMemory(phone); // Retorna do fallback em caso de erro
        }
    }

    async saveSession(phone, session) {
        try {
            session.lastActivity = Date.now();
            if (this.fallbackToMemory) {
                this.memoryCache.set(phone, session);
                return;
            }
            await this.client.setEx(`session:${phone}`, 86400, JSON.stringify(session)); // 24h TTL
        } catch (error) {
            logger.error('⚠️ Redis saveSession falhou:', error.message);
            this.memoryCache.set(phone, session);
        }
    }

    getSessionFromMemory(phone) {
        if (!this.memoryCache.has(phone)) {
            this.memoryCache.set(phone, this.createNewSession());
        }
        return this.memoryCache.get(phone);
    }
    
    async close() {
        if (!this.fallbackToMemory && this.client.isOpen) {
            await this.client.disconnect();
            logger.info('✅ Redis desconectado gracefully');
        }
    }
}

module.exports = new SessionManager();
