// server.js
require('dotenv').config();
const app = require('./src/app'); // Importa a configuração do app Express

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log('🚀🛡️ === SECRETÁRIA NEPQ BLINDADA v4.0 (Arquitetura Modular) === 🛡️🚀');
    console.log(`📍 Servidor rodando na porta: ${PORT}`);
    // Adicione outros logs de inicialização que desejar aqui
});

// Lógica para desligamento seguro (Graceful Shutdown)
process.on('SIGTERM', () => {
    console.log('📴 Recebido SIGTERM, iniciando shutdown graceful...');
    server.close(async () => {
        const sessionManager = require('./src/services/sessionManager');
        await sessionManager.close();
        console.log('Processo finalizado.');
        process.exit(0);
    });
});
