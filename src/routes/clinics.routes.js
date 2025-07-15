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
        const { data: existing, error: selectError } = await supabase
            .from('clinic_settings')
            .select('clinic_id')
            .eq('clinic_id', clinicId)
            .single();

        if (selectError && selectError.code !== 'PGRST116') {
            console.error('Erro ao verificar settings existentes:', selectError);
            throw selectError;
        }

        let result;

        if (existing) {
            const { data, error } = await supabase
                .from('clinic_settings')
                .update({ google_calendar_id })
                .eq('clinic_id', clinicId)
                .select()
                .single();

            if (error) throw error;
            result = data;
        } else {
            const { data, error } = await supabase
                .from('clinic_settings')
                .insert({ clinic_id: clinicId, google_calendar_id })
                .select()
                .single();

            if (error) throw error;
            result = data;
        }

        console.log(`[API] ID da Agenda para a clínica ${clinicId} atualizado com sucesso.`);
        res.status(200).json(result);

    } catch (error) {
        res.status(500).json({ error: 'Erro interno ao atualizar a clínica.', details: error.message });
    }
});

module.exports = router;
