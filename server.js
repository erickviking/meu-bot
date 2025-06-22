// server.js
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
