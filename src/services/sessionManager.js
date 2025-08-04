// src/services/sessionManager.js
const redis = require('redis');
const config = require('../config');
const clinicService = require('./clinic.service');
const supabase = require('./supabase.client');

class SessionManager {
    constructor() {
        this.client = redis.createClient({ url: config.redisUrl });
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
            onboardingState: 'start',
            state: 'onboarding',
            conversationHistory: [],
            messageBuffer: [],
            clinicConfig: null,

            // 🔹 Novos campos para controle da IA
            isAiActive: true,
            lastManualMessageAt: null,

            // 🔹 Timestamp para controle de inatividade
            lastActivity: Date.now(),
        };
    }

    async resetSession(from) {
        const newSession = this.createNewSession();
        await this.saveSession(from, newSession);
    }

    /**
     * Recupera a sessão do paciente
     * - Usa Redis se disponível, caso contrário, fallback em memória
     * - Carrega configuração da clínica se ausente
     * - Sincroniza status da IA com o banco na primeira chamada
     */
    async getSession(phone) {
        let session;

        try {
            if (this.fallbackToMemory) {
                session = this.getSessionFromMemory(phone);
            } else {
                const sessionData = await this.client.get(`session:${phone}`);
                session = sessionData ? JSON.parse(sessionData) : this.createNewSession();
            }

            // 🔹 Garante campos obrigatórios
            if (!session.onboardingState) session.onboardingState = session.firstName ? 'complete' : 'start';
            if (!session.messageBuffer) session.messageBuffer = [];
            if (session.isAiActive === undefined) session.isAiActive = true;

            // --- Multi-tenant: garantir que a clínica esteja carregada ---
            if (!session.clinicConfig) {
                console.log(`[Multi-Tenant] Configuração da clínica não encontrada para ${phone}. Buscando...`);
                const botWhatsappId = config.whatsapp.phoneId;
                const clinicConfig = await clinicService.getClinicConfigByWhatsappId(botWhatsappId);

                if (clinicConfig) {
                    console.log(`[Multi-Tenant] Clínica "${clinicConfig.doctorName}" carregada para a sessão.`);
                    session.clinicConfig = clinicConfig;
                    await this.saveSession(phone, session);
                } else {
                    console.error(`🚨 CRÍTICO: Nenhuma clínica encontrada para whatsapp_phone_id: ${botWhatsappId}`);
                }
            }

            // --- 🔹 Sincroniza status da IA com o banco na primeira carga ---
            if (!session.lastManualMessageAt) {
                const { data: patient } = await supabase
                    .from('patients')
                    .select('is_ai_active, last_manual_message_at')
                    .eq('phone', phone)
                    .maybeSingle();

                if (patient) {
                    session.isAiActive = patient.is_ai_active ?? true;
                    session.lastManualMessageAt = patient.last_manual_message_at || null;
                    console.log(`[SessionManager] Sessão de ${phone} sincronizada com Supabase (isAiActive=${session.isAiActive})`);
                    await this.saveSession(phone, session);
                }
            }

            return session;

        } catch (error) {
            console.error('⚠️ Redis getSession falhou:', error.message);
            this.fallbackToMemory = true;
            return this.getSessionFromMemory(phone);
        }
    }

    /**
     * Salva a sessão em Redis (ou em memória no fallback)
     */
    async saveSession(phone, session) {
        try {
            session.lastActivity = Date.now();

            if (this.fallbackToMemory) {
                this.memoryCache.set(phone, session);
                return;
            }

            await this.client.setEx(`session:${phone}`, 86400, JSON.stringify(session)); // TTL de 24h
        } catch (error) {
            console.error('⚠️ Redis saveSession falhou:', error.message);
            this.memoryCache.set(phone, session);
        }
    }

    /**
     * Recupera sessão do fallback em memória
     */
    getSessionFromMemory(phone) {
        if (!this.memoryCache.has(phone)) {
            this.memoryCache.set(phone, this.createNewSession());
        }
        return this.memoryCache.get(phone);
    }

    async close() {
        if (!this.fallbackToMemory && this.client.isOpen) {
            await this.client.disconnect();
            console.log('✅ Redis desconectado gracefully');
        }
    }
}

module.exports = new SessionManager();
