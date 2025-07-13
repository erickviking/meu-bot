// server.js
// ### INÍCIO DO BLOCO DE DEPURAÇÃO ###
const logger = require('./src/utils/logger');
logger.info("==========================================");
logger.info("INICIANDO VERIFICAÇÃO DE VARIÁVEIS DE AMBIENTE");
logger.info("==========================================");
logger.info(`Valor de SUPABASE_URL: ${process.env.SUPABASE_URL}`);
logger.info(`Valor de SUPABASE_API_KEY: ${process.env.SUPABASE_API_KEY ? '****** CHAVE ENCONTRADA ******' : '!!!!!! NÃO ENCONTRADA !!!!!'}`);
logger.info(`Valor de WHATSAPP_TOKEN: ${process.env.WHATSAPP_TOKEN ? '****** CHAVE ENCONTRADA ******' : '!!!!!! NÃO ENCONTRADA !!!!!'}`);
logger.info(`Valor de OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '****** CHAVE ENCONTRADA ******' : '!!!!!! NÃO ENCONTRADA !!!!!'}`);
logger.info(`Valor de REDIS_URL: ${process.env.REDIS_URL ? '****** ENCONTRADA ******' : '!!!!!! NÃO ENCONTRADA !!!!!'}`);
logger.info("==========================================");
// ### FIM DO BLOCO de DEPURAÇÃO ###

require('dotenv').config();

// Valida as variáveis de ambiente antes de qualquer outra coisa
const config = require('./src/config');
const app = require('./src/app');

const server = app.listen(config.port, () => {
    logger.info(`🚀🛡️ === SECRETÁRIA NEPQ BLINDADA v2.0 (Arquitetura Final) === 🛡️🚀`);
    logger.info(`📍 Servidor rodando na porta: ${config.port}`);
    logger.info(`💾 Persistência: ${config.redisUrl ? 'Redis Ativo' : 'Fallback para Memória'}`);
});

process.on('SIGTERM', () => {
    logger.info('📴 Recebido SIGTERM, iniciando shutdown graceful...');
    server.close(async () => {
        const sessionManager = require('./src/services/sessionManager');
        await sessionManager.close();
        logger.info('Processo finalizado.');
        process.exit(0);
    });
});
