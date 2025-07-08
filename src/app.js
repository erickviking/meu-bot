const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const config = require('./config');
const allRoutes = require('./routes');

const app = express();

// Middleware para verificar a assinatura da Meta.
const verifyRequestSignature = (req, res, buf) => {
    if (req.originalUrl.includes('/webhook')) {
        const signature = req.headers['x-hub-signature-256'];

        if (!signature) {
            console.warn('⚠️ Assinatura de segurança (x-hub-signature-256) ausente.');
            return; // Continua o processo sem validação se não houver assinatura
        }

        const signatureHash = signature.split('=')[1];
        const expectedHash = crypto
            .createHmac('sha256', config.whatsapp.appSecret)
            .update(buf)
            .digest('hex');

        if (signatureHash !== expectedHash) {
            throw new Error('Assinatura do webhook inválida. A requisição pode ser fraudulenta.');
        }
    }
};

// Usamos o bodyParser com a função de verificação, envolto em um try/catch para robustez.
try {
    app.use(bodyParser.json({ verify: verifyRequestSignature }));
} catch (error) {
    console.error('❌ Falha ao aplicar middleware de segurança:', error);
    process.exit(1);
}

// Rota principal da aplicação que usa o router do index.js
app.use('/', allRoutes);

module.exports = app;
