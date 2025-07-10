// File: src/routes/conversation.routes.js

const express = require('express');
const { generateAndSaveSummary } = require('../services/summary.service');

const router = express.Router();

/**
 * Rota para acionar a geração e salvamento de um resumo de conversa.
 * O frontend deve chamar esta rota quando o usuário clicar em "Encerrar e Resumir".
 * POST /api/v1/conversations/:phone/summarize
 */
router.post('/:phone/summarize', async (req, res) => {
    const { phone } = req.params;
    const { clinicId } = req.body; // O frontend deve enviar o ID da clínica no corpo da requisição.

    // Validação básica
    if (!clinicId) {
        return res.status(400).json({ error: 'O ID da clínica (clinicId) é obrigatório.' });
    }

    try {
        const summaryData = await generateAndSaveSummary(phone, clinicId);

        if (!summaryData) {
            return res.status(500).json({ error: 'Ocorreu uma falha ao gerar o resumo.' });
        }
        
        // Retorna o resumo recém-criado para o frontend.
        res.status(201).json(summaryData);
    } catch (error) {
        console.error(`[API] Erro no endpoint de resumo para ${phone}:`, error);
        res.status(500).send('Erro interno do servidor.');
    }
});

module.exports = router;
