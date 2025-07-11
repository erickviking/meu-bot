// File: src/routes/conversation.routes.js (Versão de Teste Simplificada)

const express = require('express');
// const { generateAndSaveSummary } = require('../services/summary.service'); // LINHA PROBLEMÁTICA COMENTADA

const router = express.Router();

// Rota de teste que sabemos que funciona
router.get('/health-conversations', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Roteador de CONVERSAS está funcionando.' });
});

/* ROTA DE RESUMO TEMPORARIAMENTE DESATIVADA
router.post('/:phone/summarize', async (req, res) => {
    try {
        const { phone } = req.params;
        const { clinicId } = req.body;

        if (!clinicId) {
            return res.status(400).json({ error: 'clinic_id é obrigatório.' });
        }

        // const summaryData = await generateAndSaveSummary(phone, clinicId); // LINHA PROBLEMÁTICA COMENTADA

        if (!summaryData) {
            return res.status(500).json({ error: 'Falha ao gerar o resumo no serviço.' });
        }
        
        res.status(201).json(summaryData);

    } catch (error) {
        console.error('❌ Erro fatal no endpoint de resumo:', error.message);
        res.status(500).json({ 
            error: 'Erro interno do servidor ao gerar resumo.',
            details: error.message 
        });
    }
});
*/

module.exports = router;
