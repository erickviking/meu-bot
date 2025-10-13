const express = require('express');
const supabase = require('../services/supabase.client');

// --- INÍCIO DA MODIFICAÇÃO ---

// 1. Importe o novo handler de consentimento que acabamos de corrigir.
const { grantWhatsappConsent } = require('../handlers/settings.handler.js');

// 2. Importe seu middleware de autenticação.
//    (IMPORTANTE: Se o seu arquivo tiver outro nome ou local, ajuste o caminho abaixo)
const { authMiddleware } = require('../middlewares/auth.middleware.js');

// --- FIM DA MODIFICAÇÃO ---

const router = express.Router();

// --- NOVA ROTA DE CONSENTIMENTO ---
// Esta rota é segura e só pode ser acessada por um usuário autenticado.
// O caminho completo será: POST /api/v1/clinics/whatsapp-consent
router.post('/whatsapp-consent', authMiddleware, grantWhatsappConsent);


// --- ROTA EXISTENTE PARA ATUALIZAR GOOGLE CALENDAR ---
// Também adicionamos o middleware de autenticação aqui para segurança máxima.
router.patch('/:clinicId', authMiddleware, async (req, res) => {
    const { clinicId } = req.params;
    const { google_calendar_id } = req.body;

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
