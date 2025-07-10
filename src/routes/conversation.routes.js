// File: src/routes/conversation.routes.js

const express = require('express');
const { generateAndSaveSummary } = require('../services/summary.service');

const router = express.Router();

// POST /api/v1/conversations/:phone/summarize
router.post('/:phone/summarize', async (req, res) => {
    try {
        const { phone } = req.params;
        const { clinicId } = req.body;

        if (!clinicId) {
            return res.status(400).json({ error: 'clinic_id é obrigatório.' });
        }

        const summaryData = await generateAndSaveSummary(phone, clinicId);

        if (!summaryData) {
            return res.status(500).json({ error: 'Falha ao gerar o resumo no serviço.' });
        }
        
        res.status(201).json(summaryData);

    } catch (error) {
        // --- INÍCIO DA CORREÇÃO ---
        console.error('❌ Erro fatal no endpoint de resumo:', error.message);
        // Garantimos que a resposta de erro também seja em JSON.
        res.status(500).json({ 
            error: 'Erro interno do servidor ao gerar resumo.',
            details: error.message 
        });
        // --- FIM DA CORREÇÃO ---
    }
});

module.exports = router;
