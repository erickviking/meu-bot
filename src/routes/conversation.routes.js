// Ficheiro: src/routes/conversation.routes.js
// Descrição: Rotas padronizadas para gerir conversas.

const express = require('express');
const { generateAndSaveSummary } = require('../services/summary.service');
const { saveMessage, clearConversationHistory } = require('../services/message.service');
const { sendMessage } = require('../services/whatsappService');

const router = express.Router();

// --- ROTA PARA ENVIAR MENSAGEM DE TEXTO (CORRIGIDA) ---
// O endpoint agora é mais consistente com o resto da API.
// POST /api/v1/conversations/:phone/messages
router.post('/:phone/messages', async (req, res) => {
    const { phone } = req.params;
    const { text, clinicId } = req.body;

    if (!text || !clinicId) {
        return res.status(400).json({ error: 'Os campos "text" e "clinicId" são obrigatórios.' });
    }

    try {
        // 1. Envia a mensagem para o paciente via API da Meta
        await sendMessage(phone, text);

        // 2. Guarda a mensagem no nosso banco de dados
        await saveMessage({
            patient_phone: phone,
            content: text,
            clinic_id: clinicId,
            sender: 'clinic', // Indica que foi enviada pelo operador
            direction: 'outbound',
            message_type: 'text',
        });

        res.status(200).json({ success: true, message: 'Mensagem enviada e guardada com sucesso.' });
    } catch (error) {
        console.error('❌ Erro no endpoint de envio de mensagem:', error);
        res.status(500).json({ success: false, error: 'Erro interno do servidor ao enviar mensagem.' });
    }
});


// --- ROTA PARA GERAR RESUMO (EXISTENTE) ---
// POST /api/v1/conversations/:phone/summarize
router.post('/:phone/summarize', async (req, res) => {
    try {
        const { phone } = req.params;
        const { clinicId } = req.body;

        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId é obrigatório.' });
        }

        const summaryData = await generateAndSaveSummary(phone, clinicId);

        if (summaryData.error) {
            return res.status(500).json({ error: summaryData.error });
        }

        return res.status(200).json({ summary: summaryData.summary });

    } catch (error) {
        console.error('❌ Erro fatal no endpoint de resumo:', error);
        return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});


// --- ROTA PARA LIMPAR HISTÓRICO (EXISTENTE) ---
// DELETE /api/v1/conversations/:phone
router.delete('/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const { clinicId } = req.body;

        if (!clinicId) {
            return res.status(400).json({ error: 'clinicId é obrigatório.' });
        }

        const success = await clearConversationHistory(phone, clinicId);

        if (success) {
            res.status(200).json({ message: 'Histórico da conversa limpo com sucesso.' });
        } else {
            res.status(500).json({ error: 'Falha ao limpar o histórico da conversa.' });
        }
    } catch (error) {
        console.error('❌ Erro no endpoint de limpar histórico:', error);
        res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});


module.exports = router;
