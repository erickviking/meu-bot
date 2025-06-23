const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const config = require('./config');
const allRoutes = require('./routes');

const app = express();

// Middleware para verificar a assinatura da Meta.
// A opção 'verify' do bodyParser nos dá o raw body da requisição,
// que é necessário para calcular o hash HMAC.
const verifyRequestSignature = (req, res, buf, encoding) => {
    // A verificação só se aplica à rota do webhook.
    if (req.originalUrl === '/webhook') {
        const signature = req.headers['x-hub-signature-256'];

        if (!signature) {
            throw new Error('Assinatura de segurança (x-hub-signature-256) ausente.');
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

try {
    app.use(bodyParser.json({ verify: verifyRequestSignature }));
} catch (error) {
    console.error('Falha ao aplicar middleware de segurança:', error);
}


// Rota principal da aplicação
app.use('/', allRoutes);

module.exports = app;
