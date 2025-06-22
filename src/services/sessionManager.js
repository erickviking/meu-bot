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
            askedName: false,
            conversationHistory: [],
        };
    }

    async getSession(phone) {
        try {
            if (this.fallbackToMemory) return this.getSessionFromMemory(phone);
            const sessionData = await this.client.get(`session:${phone}`);
            if (sessionData) return JSON.parse(sessionData);

            const newSession = this.createNewSession();
            await this.saveSession(phone, newSession);
            return newSession;
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
    
    async resetSession(phone) {
        try {
            if (this.fallbackToMemory) {
                this.memoryCache.delete(phone);
                return;
            }
             await this.client.del(`session:${phone}`);
        } catch (error) {
            console.error('⚠️ Redis resetSession falhou:', error.message);
            this.memoryCache.delete(phone);
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

module.exports = new SessionManager();
