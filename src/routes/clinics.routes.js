// File: src/routes/clinics.routes.js

const express = require('express');
const supabase = require('../services/supabase.client'); // Assumindo que seu cliente supabase está em services

const router = express.Router();

// Usamos o método PATCH, que é o padrão para atualizações parciais de um recurso.
// PATCH /api/v1/clinics/:clinicId
router.patch('/:clinicId', async (req, res) => {
    const { clinicId } = req.params;
    const { google_calendar_id } = req.body;

    // Validação simples
    if (typeof google_calendar_id === 'undefined') {
        return res.status(400).json({ error: 'O campo "google_calendar_id" é obrigatório.' });
    }

    try {
        const { data, error } = await supabase
            .from('clinics')
            .update({ google_calendar_id: google_calendar_id }) // Atualiza apenas o campo necessário
            .eq('id', clinicId)
            .select()
            .single();

        if (error) {
            // Este erro pode acontecer se o RLS negar a atualização.
            console.error('Erro ao atualizar ID da agenda:', error);
            throw error;
        }
        
        console.log(`[API] ID da Agenda para a clínica ${clinicId} atualizado com sucesso.`);
        res.status(200).json(data);

    } catch (error) {
        res.status(500).json({ error: 'Erro interno ao atualizar a clínica.', details: error.message });
    }
});

module.exports = router;
