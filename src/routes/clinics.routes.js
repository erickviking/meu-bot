// File: src/routes/clinics.routes.js

const express = require('express');
const supabase = require('../services/supabase.client');

// ### INÍCIO DA MODIFICAÇÃO ###

// 1. Importe o novo handler de consentimento que criamos
const { grantWhatsappConsent } = require('../handlers/settings.handler.js');

// 2. Importe seu middleware de autenticação
//    (IMPORTANTE: O nome do arquivo/variável pode ser diferente no seu projeto)
const { authMiddleware } = require('../middlewares/auth.middleware.js');

// ### FIM DA MODIFICAÇÃO ###

const router = express.Router();

// --- NOVA ROTA DE CONSENTIMENTO ---
// Esta rota é protegida e só pode ser acessada por um usuário autenticado.
// POST /api/v1/clinics/whatsapp-consent
router.post('/whatsapp-consent', authMiddleware, grantWhatsappConsent);


// --- ROTA EXISTENTE PARA ATUALIZAR GOOGLE CALENDAR ---
// Usamos o método PATCH, que é o padrão para atualizações parciais de um recurso.
// Esta rota também deve ser protegida pelo mesmo middleware.
// PATCH /api/v1/clinics/:clinicId
router.patch('/:clinicId', authMiddleware, async (req, res) => {
    const { clinicId } = req.params;
    const { google_calendar_id } = req.body;

    // Validação simples
    if (typeof google_calendar_id === 'undefined') {
        return res.status(400).json({ error: 'O campo "google_calendar_id" é obrigatório.' });
    }

    try {
        const { data, error } = await supabase
            .from('clinics')
            .update({ google_calendar_id: google_calendar_id })
            .eq('id', clinicId)
            .select()
            .single();

        if (error) {
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
