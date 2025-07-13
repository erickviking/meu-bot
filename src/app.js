// File: src/app.js (Versão Final e Corrigida)

const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const config = require('./config');
const allRoutes = require('./routes');
const cors = require('cors');
const logger = require('./utils/logger');

const app = express();


// 1. O middleware do CORS deve ser o PRIMEIRO a ser usado.
// Isso garante que ele intercepte as requisições de preflight (OPTIONS)
// antes de qualquer outra lógica.
app.use(cors());


// Middleware para verificar a assinatura da Meta.
const verifyRequestSignature = (req, res, buf) => {
    // A lógica de verificação só deve rodar para o webhook.
    if (req.originalUrl.includes('/webhook')) {
        const signature = req.headers['x-hub-signature-256'];
        if (!signature) {
            logger.warn('⚠️ Assinatura de segurança (x-hub-signature-256) ausente.');
            return;
        }
        const signatureHash = signature.split('=')[1];
        const expectedHash = crypto
            .createHmac('sha256', config.whatsapp.appSecret)
            .update(buf)
            .digest('hex');
        if (signatureHash !== expectedHash) {
            throw new Error('Assinatura do webhook inválida.');
        }
    }
};


// 2. O Body Parser vem DEPOIS do CORS.
// A sua implementação com `verify` está correta para o webhook.
try {
    app.use(bodyParser.json({ verify: verifyRequestSignature }));
} catch (error) {
    logger.error({ err: error }, '❌ Falha ao aplicar middleware de segurança');
    process.exit(1);
}


// 3. Suas rotas principais são registradas no FINAL.
app.use('/', allRoutes);


module.exports = app;
