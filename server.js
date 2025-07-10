// server.js
// ### INÍCIO DO BLOCO DE DEPURAÇÃO ###
console.log("==========================================");
console.log("INICIANDO VERIFICAÇÃO DE VARIÁVEIS DE AMBIENTE");
console.log("==========================================");
console.log(`Valor de SUPABASE_URL: ${process.env.SUPABASE_URL}`);
console.log(`Valor de SUPABASE_API_KEY: ${process.env.SUPABASE_API_KEY ? '****** CHAVE ENCONTRADA ******' : '!!!!!! NÃO ENCONTRADA !!!!!'}`);
console.log(`Valor de WHATSAPP_TOKEN: ${process.env.WHATSAPP_TOKEN ? '****** CHAVE ENCONTRADA ******' : '!!!!!! NÃO ENCONTRADA !!!!!'}`);
console.log(`Valor de OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '****** CHAVE ENCONTRADA ******' : '!!!!!! NÃO ENCONTRADA !!!!!'}`);
console.log(`Valor de REDIS_URL: ${process.env.REDIS_URL ? '****** ENCONTRADA ******' : '!!!!!! NÃO ENCONTRADA !!!!!'}`);
console.log("==========================================");
// ### FIM DO BLOCO de DEPURAÇÃO ###

require('dotenv').config();

// Valida as variáveis de ambiente antes de qualquer outra coisa
const config = require('./src/config');
const app = require('./src/app');

const server = app.listen(config.port, () => {
    console.log(`🚀🛡️ === SECRETÁRIA NEPQ BLINDADA v2.0 (Arquitetura Final) === 🛡️🚀`);
    console.log(`📍 Servidor rodando na porta: ${config.port}`);
    console.log(`💾 Persistência: ${config.redisUrl ? 'Redis Ativo' : 'Fallback para Memória'}`);
});

process.on('SIGTERM', () => {
    console.log('📴 Recebido SIGTERM, iniciando shutdown graceful...');
    server.close(async () => {
        const sessionManager = require('./src/services/sessionManager');
        await sessionManager.close();
        console.log('Processo finalizado.');
        process.exit(0);
    });
});
