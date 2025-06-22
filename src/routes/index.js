// src/routes/index.js
const express = require('express');
const webhookRoutes = require('./webhook.routes');

const router = express.Router();

router.use(webhookRoutes);

// Rota de Healthcheck para o Docker
router.get('/health', (req, res) => {
    // A verificação do Redis pode ser adicionada aqui no futuro, se necessário.
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
