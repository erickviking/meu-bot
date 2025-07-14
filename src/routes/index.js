// File: src/routes/index.js (Versão Final e Corrigida)

const express = require('express');

// Importa os roteadores secundários
const webhookRoutes = require('./webhook.routes');
const conversationRoutes = require('./conversation.routes');
const patientRoutes = require('./patients.routes');
const clinicRoutes = require('./clinics.routes');

// Inicializa o roteador principal
const router = express.Router();

// Delega as rotas para os seus respectivos handlers
router.use('/', webhookRoutes);
router.use('/api/v1/conversations', conversationRoutes);
router.use('/api/v1/patients', patientRoutes);
router.use('/api/v1/clinics', clinicRoutes);

module.exports = router;
