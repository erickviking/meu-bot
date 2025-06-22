// src/app.js
const express = require('express');
const bodyParser = require('body-parser');
const allRoutes = require('./routes');
const crypto = require('crypto');
const config = require('./config');

const app = express();

// Middleware de segurança para validar a assinatura do webhook da Meta
const verifyRequestSignature = (req, res, buf) => {
    const signature = req.headers['x-hub-signature-256'];
    if (signature) {
        const elements = signature.split('=');
        const signatureHash = elements[1];
        const expectedHash = crypto
            .createHmac('sha256', config.whatsapp.appSecret)
            .update(buf)
            .digest('hex');
        if (signatureHash !== expectedHash) {
            throw new Error('Assinatura do webhook inválida.');
        }
    } else {
        console.warn("Aviso: Requisição recebida sem assinatura. Em produção, isso deve ser um erro.");
    }
};

// Usamos o bodyParser com a opção `verify` para capturar o rawBody antes do parse
app.use(bodyParser.json({ verify: verifyRequestSignature }));

// Rota principal da aplicação
app.use('/', allRoutes);

module.exports = app;
