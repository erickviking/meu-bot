// File: src/routes/patients.routes.js
const express = require('express');
const supabase = require('../services/supabase.client');

const router = express.Router();
const logger = require('../utils/logger');

// Rota para atualizar o status da automação de um paciente
// PATCH /api/v1/patients/5511.../toggle-automation
router.patch('/:phone/toggle-automation', async (req, res) => {
    const { phone } = req.params;
    const { isAiActive } = req.body; // Espera um corpo como { "isAiActive": false }

    if (typeof isAiActive !== 'boolean') {
        return res.status(400).json({ error: 'O campo "isAiActive" é obrigatório e deve ser um booleano.' });
    }

    try {
        const { data, error } = await supabase
            .from('patients')
            .update({ is_ai_active: isAiActive })
            .eq('phone', phone)
            .select()
            .single();

        if (error) throw error;
        
        logger.info(`[API] Automação para ${phone} atualizada para: ${isAiActive}`);
        res.status(200).json(data);

    } catch (error) {
        logger.error('❌ Erro ao atualizar automação:', error.message);
        res.status(500).json({ error: 'Erro interno ao atualizar o status da automação.' });
    }
});

module.exports = router;
