// src/routes/webhook.routes.js
const express = require('express');
const { processIncomingMessage, verifyWebhook } = require('../handlers/webhook.handler');

const router = express.Router();

// A rota POST /webhook é processada pelo handler.
router.post('/webhook', processIncomingMessage);

// A rota GET /webhook é usada apenas para a verificação inicial da Meta.
router.get('/webhook', verifyWebhook);

module.exports = router;
