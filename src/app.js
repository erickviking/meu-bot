// File: src/app.js (Versão Final de Depuração com Logger)

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const config = require('./config');
const allRoutes = require('./routes');
const cors = require('cors');

const app = express();

// --- INÍCIO DA MODIFICAÇÃO: MIDDLEWARE DE LOG ---
// Este middleware será o PRIMEIRO a ser executado para TODAS as requisições.
// Ele vai nos dizer se a chamada do frontend está chegando aqui.
app.use((req, res, next) => {
  console.log(`[Request Logger] Recebida: ${req.method} ${req.originalUrl} de ${req.headers.origin || 'origem desconhecida'}`);
  next(); // Passa a requisição para o próximo middleware na cadeia (cors).
});
// --- FIM DA MODIFICAÇÃO ---

// O middleware do CORS vem em segundo.
app.use(cors());

// Middleware para verificar a assinatura da Meta.
const verifyRequestSignature = (req, res, buf) => {
    if (req.originalUrl.includes('/webhook')) {
        const signature = req.headers['x-hub-signature-256'];
        if (!signature) {
            console.warn('⚠️ Assinatura de segurança (x-hub-signature-256) ausente.');
            return;
        }
        const signatureHash = signature.split('=')[1];
        const expectedHash = crypto.createHmac('sha256', config.whatsapp.appSecret).update(buf).digest('hex');
        if (signatureHash !== expectedHash) {
            throw new Error('Assinatura do webhook inválida.');
        }
    }
};

// O Body Parser vem depois do CORS e do Logger.
try {
    app.use(bodyParser.json({ verify: verifyRequestSignature }));
} catch (error) {
    console.error('❌ Falha ao aplicar middleware de segurança:', error);
    process.exit(1);
}

// Suas rotas principais são registradas no final.
app.use('/', allRoutes);

module.exports = app;
