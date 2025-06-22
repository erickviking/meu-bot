// src/services/whatsappService.js
const config = require('../config');

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
            console.error('❌ Erro da API do WhatsApp:', JSON.stringify(errorData, null, 2));
        }

    } catch (error) {
        console.error('❌ Erro de rede ao enviar mensagem via WhatsApp API:', error.message);
    }
}

module.exports = { sendMessage };
