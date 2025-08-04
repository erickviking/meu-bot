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

    /**
     * Cria uma nova sessão em branco
     */
    createNewSession() {
        return {
            firstName: null,
            onboardingState: 'start',
            state: 'onboarding',
            conversationHistory: [],
            messageBuffer: [],
            clinicConfig: null,

            // 🔹 Controle da IA
            isAiActive: true,
            lastManualMessageAt: null,

            // 🔹 Timestamp para controle de inatividade
            lastActivity: Date.now(),
        };
    }

    /**
     * Reseta a sessão de um paciente
     */
    async resetSession(phone) {
        const newSession = this.createNewSession();
        await this.saveSession(phone, newSession);
    }

    /**
     * Recupera ou cria a sessão do paciente
     * - Usa Redis ou fallback em memória
     * - Carrega configuração da clínica (multi-tenant)
     * - Sincroniza status da IA com Supabase
     */
    async getSession(phone) {
        let session;

        try {
            // 1️⃣ Recupera sessão do Redis ou memória
            if (this.fallbackToMemory) {
                session = this.getSessionFromMemory(phone);
            } else {
                const sessionData = await this.client.get(`session:${phone}`);
                session = sessionData ? JSON.parse(sessionData) : this.createNewSession();
            }

            // 2️⃣ Garante campos obrigatórios
            if (!session.onboardingState) session.onboardingState = session.firstName ? 'complete' : 'start';
            if (!session.messageBuffer) session.messageBuffer = [];
            if (session.isAiActive === undefined) session.isAiActive = true;

            // 3️⃣ Multi-tenant: carregar config da clínica, se ausente
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

            // 4️⃣ Sincroniza status da IA e última mensagem manual com o Supabase
            const { data: patient } = await supabase
                .from('patients')
                .select('is_ai_active, last_manual_message_at')
                .eq('phone', phone)
                .maybeSingle();

            if (patient) {
                session.isAiActive = patient.is_ai_active ?? true;
                session.lastManualMessageAt = patient.last_manual_message_at || null;
                console.log(`[SessionManager] Sessão de ${phone} sincronizada (isAiActive=${session.isAiActive})`);
                await this.saveSession(phone, session);
            }

            return session;
        } catch (error) {
            console.error('⚠️ Redis getSession falhou:', error.message);
            this.fallbackToMemory = true;
            return this.getSessionFromMemory(phone);
        }
    }

    /**
     * Salva a sessão em Redis ou em memória (fallback)
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

    /**
     * Fecha conexão com Redis
     */
    async close() {
        if (!this.fallbackToMemory && this.client.isOpen) {
            await this.client.disconnect();
            console.log('✅ Redis desconectado gracefully');
        }
    }
}

module.exports = new SessionManager();

