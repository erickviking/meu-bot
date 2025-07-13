require('dotenv').config();
const logger = require('../utils/logger');

const config = {
    port: process.env.PORT || 3000,
    redisUrl: process.env.REDIS_URL,
    
    whatsapp: {
        token: process.env.WHATSAPP_TOKEN,
        phoneId: process.env.WHATSAPP_PHONE_ID,
        verifyToken: process.env.VERIFY_TOKEN,
        appSecret: process.env.WHATSAPP_APP_SECRET
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY
    },
    supabase: {
        url: process.env.SUPABASE_URL,
        apiKey: process.env.SUPABASE_API_KEY
    }
};

// Validação para garantir que a aplicação não inicie sem as chaves críticas.
const requiredConfigs = [
    'whatsapp.token',
    'whatsapp.phoneId',
    'whatsapp.verifyToken',
    'whatsapp.appSecret',
    'openai.apiKey',
    'redisUrl',
    'supabase.url',
    'supabase.apiKey'
];

// Função auxiliar para buscar valores aninhados no objeto de configuração.
const getConfigValue = (path) => path.split('.').reduce((acc, part) => acc && acc[part], config);

// Filtra para encontrar quais configurações estão faltando.
const missingConfigs = requiredConfigs.filter(path => !getConfigValue(path));

// Se alguma configuração crítica estiver faltando, o processo é encerrado com um erro claro.
if (missingConfigs.length > 0) {
    logger.fatal({ missingConfigs }, '❌ ERRO FATAL: Variáveis de ambiente críticas faltando');
    process.exit(1);
}

module.exports = config;
