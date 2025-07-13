// File: src/routes/index.js

// Inicializa o roteador principal do Express
const express = require('express');
const webhookRoutes = require('./webhook.routes');
const conversationRoutes = require('./conversation.routes');
const patientRoutes = require('./patients.routes'); // <-- 1. IMPORTAR A NOVA ROTA
const clinicRoutes = require('./clinics.routes'); // 1. IMPORTAR

const router = express.Router();

router.use('/', webhookRoutes);
router.use('/api/v1/conversations', conversationRoutes);
router.use('/api/v1/patients', patientRoutes); // <-- 2. USAR A NOVA ROTA
router.use('/api/v1/clinics', clinicRoutes); // 2. USAR

module.exports = router;
