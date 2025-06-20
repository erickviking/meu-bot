// src/services/whatsappService.js
async function sendMessage(to, text) {
    if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID) {
        console.error('❌ Variáveis de ambiente do WhatsApp não configuradas!');
        return;
    }
    try {
        await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: to,
                text: {
                    body: text
                },
            }),
        });
    } catch (error) {
        console.error('❌ Erro ao enviar mensagem via WhatsApp API:', error.message);
    }
}

module.exports = { sendMessage };
