// src/routes/webhook.routes.js
const express = require('express');
const { processIncomingMessage, verifyWebhook } = require('../handlers/webhook.handler');

const router = express.Router();

router.post('/webhook', processIncomingMessage);
router.get('/webhook', verifyWebhook);

module.exports = router;
