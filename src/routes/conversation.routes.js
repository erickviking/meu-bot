// File: src/routes/conversation.routes.js

const express = require('express');
const { generateAndSaveSummary } = require('../services/summary.service');

const router = express.Router();

console.log("🔍 Importação de summary.service:", require('../services/summary.service'));

// POST /api/v1/conversations/:phone/summarize
router.post('/:phone/summarize', async (req, res) => {
    try {
        const { phone } = req.params;
        const { clinicId } = req.body;

        if (!clinicId) {
            return res.status(400).json({ error: 'clinic_id é obrigatório.' });
        }

        const summaryData = await generateAndSaveSummary(phone, clinicId);

        if (!summaryData || summaryData.error) {
            return res.status(500).json({ 
                error: summaryData?.error || 'Falha ao gerar o resumo no serviço.'
            });
        }

        // Garante estrutura compatível com frontend
        return res.status(200).json({ summary: summaryData.summary });

    } catch (error) {
        console.error('❌ Erro fatal no endpoint de resumo:', error);
        return res.status(500).json({ 
            error: 'Erro interno do servidor ao gerar resumo.',
            details: error.message
        });
    }
});

module.exports = router;

