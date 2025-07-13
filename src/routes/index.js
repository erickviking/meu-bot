// File: src/routes/index.js
// Description: Roteador principal da aplicação. Centraliza e delega todas as rotas para os seus respectivos módulos.

const express = require('express');
const webhookRoutes = require('./webhook.routes');
const conversationRoutes = require('./conversation.routes');

// Inicializa o roteador principal do Express
const router = express.Router();
const patientRoutes = require('./patients.routes'); // <-- 1. IMPORTAR A NOVA ROTA

router.use('/', webhookRoutes);
router.use('/api/v1/conversations', conversationRoutes);
router.use('/api/v1/patients', patientRoutes); // <-- 2. USAR A NOVA ROTA

module.exports = router;
