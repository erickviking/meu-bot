// src/config/index.js
require('dotenv').config();

const config = {
    port: process.env.PORT || 3000,
    redisUrl: process.env.REDIS_URL,
    whatsapp: {
        token: process.env.WHATSAPP_TOKEN,
        phoneId: process.env.WHATSAPP_PHONE_ID,
        verifyToken: process.env.VERIFY_TOKEN,
        appSecret: process.env.WHATSAPP_APP_SECRET // Crítico para segurança
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY
    },
    clinic: {
        contactPhone: process.env.CONTACT_PHONE || '(XX) XXXX-XXXX',
        consultationValue: process.env.CONSULTA_VALOR || '400'
    }
};

// Validação de variáveis críticas
const requiredConfigs = [
    'whatsapp.token',
    'whatsapp.phoneId',
    'whatsapp.verifyToken',
    'whatsapp.appSecret',
    'openai.apiKey',
    'redisUrl'
];

const missingConfigs = requiredConfigs.filter(path => !path.split('.').reduce((acc, part) => acc && acc[part], config));

if (missingConfigs.length > 0) {
    console.error('❌ ERRO FATAL: Variáveis de ambiente faltando:', missingConfigs.join(', '));
    process.exit(1);
}

module.exports = config;
