// src/routes/index.js
const express = require('express');
const webhookRoutes = require('./webhook.routes');
// const monitoringRoutes = require('./monitoring.routes'); // Exemplo para o futuro

const router = express.Router();

router.use(webhookRoutes); // Usa as rotas do webhook na raiz
// router.use('/status', monitoringRoutes); // Exemplo de como adicionar outras

module.exports = router;
