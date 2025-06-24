require('dotenv').config();

const config = {
    port: process.env.PORT || 3000,
    redisUrl: process.env.REDIS_URL,
    // NOVO: Adicionada a URL de conexão com o banco de dados
    databaseUrl: process.env.DATABASE_URL,
    whatsapp: {
        token: process.env.WHATSAPP_TOKEN,
        phoneId: process.env.WHATSAPP_PHONE_ID,
        verifyToken: process.env.VERIFY_TOKEN,
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY
    },
};

// Validação para garantir que a aplicação não inicie sem as chaves críticas.
const requiredConfigs = [
    'whatsapp.token',
    'whatsapp.phoneId',
    'whatsapp.verifyToken',
    'openai.apiKey',
    'redisUrl',
    'databaseUrl' // NOVO: Validação adicionada
];

const getConfigValue = (path) => path.split('.').reduce((acc, part) => acc && acc[part], config);

const missingConfigs = requiredConfigs.filter(path => !getConfigValue(path));

if (missingConfigs.length > 0) {
    console.error('❌ ERRO FATAL: Variáveis de ambiente críticas faltando:', missingConfigs.join(', '));
    process.exit(1);
}

module.exports = config;
