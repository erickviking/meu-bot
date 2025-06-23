// src/services/sessionManager.js
const redis = require('redis');
const config = require('../config');

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
            onboardingState: 'start', // Estados: 'start', 'awaiting_name', 'complete'
            conversationHistory: [],
            messageBuffer: [], // Buffer para agrupar mensagens
        };
    }

    async resetSession(from) {
        // Esta função agora está centralizada aqui.
        const newSession = this.createNewSession();
        await this.saveSession(from, newSession);
    }

    async getSession(phone) {
        try {
            if (this.fallbackToMemory) return this.getSessionFromMemory(phone);
            const sessionData = await this.client.get(`session:${phone}`);
            if (sessionData) {
                const session = JSON.parse(sessionData);
                // Garante que sessões antigas tenham os novos campos de estado
                if (!session.onboardingState) {
                    session.onboardingState = session.firstName ? 'complete' : 'start';
                }
                if (!session.messageBuffer) {
                    session.messageBuffer = [];
                }
                return session;
            }
            // Se não houver sessão, cria uma nova.
            return this.createNewSession();
        } catch (error) {
            console.error('⚠️ Redis getSession falhou:', error.message);
            this.fallbackToMemory = true;
            return this.getSessionFromMemory(phone);
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
            console.error('⚠️ Redis saveSession falhou:', error.message);
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
            console.log('✅ Redis desconectado gracefully');
        }
    }
}

// Exportamos uma única instância para ser usada em toda a aplicação (Singleton Pattern)
module.exports = new SessionManager();
