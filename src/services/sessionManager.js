// src/services/sessionManager.js
const redis = require('redis');
const config = require('../config');
// Importa o nosso novo serviço e o cliente Supabase
const clinicService = require('./clinic.service');

class SessionManager {
    constructor() {
        this.client = redis.createClient({ url: config.redisUrl });

        // Se ocorrer um erro, apenas logamos. A falha será percebida ao tentar usar o Redis.
        this.client.on('error', (err) => {
            console.error('❌ ERRO DE CONEXÃO COM REDIS:', err);
        });

        this.client.connect()
            .then(() => {
                console.log('✅ Redis conectado - Sessions persistentes ativas');
            })
            .catch(err => {
                console.error('🚨 FALHA CRÍTICA AO CONECTAR COM REDIS NA INICIALIZAÇÃO:', err);
                // Em produção, considere terminar o processo para que o orquestrador o reinicie.
                // process.exit(1);
            });
    }

     createNewSession() {
        return {
            firstName: null,
            onboardingState: 'start',
            state: 'onboarding',
            conversationHistory: [],
            conversationSummary: '',
            messageBuffer: [],
            clinicConfig: null,
        };
    }

    async resetSession(from) {
        const newSession = this.createNewSession();
        await this.saveSession(from, newSession);
    }

    async getSession(phone) {
        const sessionData = await this.client.get(`session:${phone}`);
        const session = sessionData ? JSON.parse(sessionData) : this.createNewSession();

        // Garante compatibilidade com versões antigas da sessão
        if (session.onboardingState === undefined) session.onboardingState = session.firstName ? 'complete' : 'start';
        if (session.messageBuffer === undefined) session.messageBuffer = [];
        if (session.conversationSummary === undefined) session.conversationSummary = '';

        // ### INÍCIO DA LÓGICA MULTI-TENANT ###
        if (!session.clinicConfig) {
            console.log(`[Multi-Tenant] Configuração da clínica não encontrada para ${phone}. Buscando...`);

            const botWhatsappId = config.whatsapp.phoneId;
            const clinicConfig = await clinicService.getClinicConfigByWhatsappId(botWhatsappId);

            if (clinicConfig) {
                console.log(`[Multi-Tenant] Clínica "${clinicConfig.doctorName}" carregada para a sessão.`);
                session.clinicConfig = clinicConfig;
                await this.saveSession(phone, session);
            } else {
                console.error(`🚨 CRÍTICO: Nenhuma clínica encontrada para o whatsapp_phone_id: ${botWhatsappId}. Verifique o banco de dados.`);
            }
        }
        // ### FIM DA LÓGICA MULTI-TENANT ###

        return session;
    }

    async saveSession(phone, session) {
        session.lastActivity = Date.now();
        await this.client.setEx(`session:${phone}`, 86400, JSON.stringify(session));
    }

    async close() {
        if (this.client.isOpen) {
            await this.client.disconnect();
            console.log('✅ Redis desconectado gracefully');
        }
    }
}

module.exports = new SessionManager();
