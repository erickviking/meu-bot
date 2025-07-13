// src/services/whatsappService.js
const config = require('../config');
const logger = require('../utils/logger');

async function sendMessage(to, text) {
    try {
        const response = await fetch(`https://graph.facebook.com/v19.0/${config.whatsapp.phoneId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${config.whatsapp.token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                text: { body: text },
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            logger.error('❌ Erro da API do WhatsApp:', JSON.stringify(errorData, null, 2));
        }

    } catch (error) {
        logger.error('❌ Erro de rede ao enviar mensagem via WhatsApp API:', error.message);
    }
}


async function downloadMedia(mediaId) {
    try {
        const infoRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${config.whatsapp.token}` }
        });
        if (!infoRes.ok) {
            logger.error('❌ Falha ao obter URL do media:', await infoRes.text());
            return null;
        }
        const info = await infoRes.json();
        const mediaRes = await fetch(info.url, {
            headers: { 'Authorization': `Bearer ${config.whatsapp.token}` }
        });
        if (!mediaRes.ok) {
            logger.error('❌ Falha ao baixar media:', await mediaRes.text());
            return null;
        }
        const arrayBuffer = await mediaRes.arrayBuffer();
        return Buffer.from(arrayBuffer);
    } catch (error) {
        logger.error('❌ Erro ao baixar media:', error.message);
        return null;
    }
}

module.exports = { sendMessage, downloadMedia };
