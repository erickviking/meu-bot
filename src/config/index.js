require('dotenv').config();

const config = {
    port: process.env.PORT || 3000,
    redisUrl: process.env.REDIS_URL,
    databaseUrl: process.env.DATABASE_URL, // Pode manter, caso use em outro lugar.
    whatsapp: {
        token: process.env.WHATSAPP_TOKEN,
        phoneId: process.env.WHATSAPP_PHONE_ID,
        verifyToken: process.env.VERIFY_TOKEN,
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY
    },
    // ### INÍCIO DA CORREÇÃO ###
    // Adiciona a seção para ler as variáveis de ambiente do Supabase.
    supabase: {
        url: process.env.SUPABASE_URL,
        apiKey: process.env.SUPABASE_API_KEY
    }
    // ### FIM DA CORREÇÃO ###
};

// Validação para garantir que a aplicação não inicie sem as chaves críticas.
const requiredConfigs = [
    'whatsapp.token',
    'whatsapp.phoneId',
    'whatsapp.verifyToken',
    'openai.apiKey',
    'redisUrl',
    // ### INÍCIO DA CORREÇÃO ###
    // Adiciona as novas variáveis do Supabase à lista de validação.
    'supabase.url',
    'supabase.apiKey'
    // ### FIM DA CORREÇÃO ###
];

const getConfigValue = (path) => path.split('.').reduce((acc, part) => acc && acc[part], config);

const missingConfigs = requiredConfigs.filter(path => !getConfigValue(path));

if (missingConfigs.length > 0) {
    console.error('❌ ERRO FATAL: Variáveis de ambiente críticas faltando:', missingConfigs.join(', '));
    process.exit(1);
}

module.exports = config;
