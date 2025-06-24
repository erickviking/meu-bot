require('dotenv').config();

const config = {
    port: process.env.PORT || 3000,
    redisUrl: process.env.REDIS_URL,
    whatsapp: {
        token: process.env.WHATSAPP_TOKEN,
        phoneId: process.env.WHATSAPP_PHONE_ID,
        verifyToken: process.env.VERIFY_TOKEN,
        // ### INÍCIO DA CORREÇÃO ###
        // Adiciona a leitura do App Secret, necessário para validar webhooks.
        appSecret: process.env.WHATSAPP_APP_SECRET
        // ### FIM DA CORREÇÃO ###
    },
    openai: {
        apiKey: process.env.OPENAI_API_KEY
    },
    supabase: {
        url: process.env.SUPABASE_URL,
        apiKey: process.env.SUPABASE_API_KEY
    }
};

const requiredConfigs = [
    'whatsapp.token',
    'whatsapp.phoneId',
    'whatsapp.verifyToken',
    'openai.apiKey',
    'redisUrl',
    'supabase.url',
    'supabase.apiKey',
    // ### INÍCIO DA CORREÇÃO ###
    // Adiciona o App Secret à lista de validação.
    'whatsapp.appSecret'
    // ### FIM DA CORREÇÃO ###
];

// ... (O resto do arquivo permanece o mesmo) ...

const getConfigValue = (path) => path.split('.').reduce((acc, part) => acc && acc[part], config);
const missingConfigs = requiredConfigs.filter(path => !getConfigValue(path));
if (missingConfigs.length > 0) {
    console.error('❌ ERRO FATAL: Variáveis de ambiente críticas faltando:', missingConfigs.join(', '));
    process.exit(1);
}

module.exports = config;
