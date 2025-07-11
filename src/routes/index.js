// File: src/routes/index.js
// Description: Roteador principal da aplicação. Centraliza e delega todas as rotas para os seus respectivos módulos.

const express = require('express');
const webhookRoutes = require('./webhook.routes');
const conversationRoutes = require('./conversation.routes');

// Inicializa o roteador principal do Express
const router = express.Router();

// --- ROTA DE TESTE PARA ESTE ARQUIVO ---
router.get('/health-index', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Roteador principal (index.js) está funcionando.' });
});
// --- FIM DO TESTE ---

/**
 * @path /
 * @description Rota raiz que lida com os webhooks da API do WhatsApp.
 * É o ponto de entrada principal para a comunicação com a Meta.
 * - GET /webhook: Para verificação do endpoint.
 * - POST /webhook: Para receber as mensagens dos usuários.
 */
router.use('/', webhookRoutes);

/**
 * @path /api/v1/conversations
 * @description Rotas para a API interna da aplicação, usadas pelo frontend (Painel CRM).
 * O prefixo /api/v1 ajuda a versionar e organizar os endpoints internos.
 * - POST /api/v1/conversations/:phone/summarize: Aciona a geração de resumo para uma conversa.
 */
router.use('/api/v1/conversations', conversationRoutes);

module.exports = router;
