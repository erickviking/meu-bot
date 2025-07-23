// Ficheiro: src/routes/conversation.routes.js
// Descrição: Adiciona os endpoints para enviar mensagens e limpar o histórico.

const express = require('express');
const { generateAndSaveSummary } = require('../services/summary.service');
const { saveMessage, clearConversationHistory } = require('../services/message.service');
const { sendMessage } = require('../services/whatsappService');

const router = express.Router();

// --- ROTA PARA ENVIAR MENSAGEM DE TEXTO (NOVA) ---
// Esta rota é chamada pelo frontend para enviar uma mensagem manual.
// POST /send-text (Movida para a raiz para simplicidade)
router.post('/send-text', async (req, res) => {
    const { to, text, clinicId } = req.body;

    if (!to || !text || !clinicId) {
        return res.status(400).json({ error: 'Os campos "to", "text" e "clinicId" são obrigatórios.' });
    }

    try {
        // 1. Envia a mensagem para o paciente via API da Meta
        await sendMessage(to, text);

        // 2. Guarda a mensagem no nosso banco de dados
        await saveMessage({
            patient_phone: to,
            content: text,
            clinic_id: clinicId,
            sender: 'clinic', // Indica que foi enviada pelo operador
            direction: 'outbound',
            message_type: 'text',
        });

        res.status(200).json({ success: true, message: 'Mensagem enviada e guardada com sucesso.' });
    } catch (error) {
        console.error('❌ Erro no endpoint /send-text:', error);
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


// --- ROTA PARA LIMPAR HISTÓRICO (NOVA) ---
// DELETE /api/v1/conversations/:phone
router.delete('/:phone', async (req, res) => {
    try {
        const { phone } = req.params;
        const { clinicId } = req.body; // clinicId no corpo para segurança

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
