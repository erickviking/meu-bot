// src/services/whatsappService.js
const config = require('../config');
const fetch = require('node-fetch'); // Garante compatibilidade em Node.js

/**
 * Envia uma mensagem de texto via API oficial do WhatsApp.
 */
async function sendMessage(to, text) {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${config.whatsapp.phoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          text: { body: text },
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('❌ [WhatsApp] Erro na API ao enviar mensagem:', JSON.stringify(errorData, null, 2));
    }
  } catch (error) {
    console.error('❌ [WhatsApp] Erro de rede ao enviar mensagem:', error.message);
  }
}

/**
 * Faz o download de uma mídia (imagem, áudio, documento, etc.) da API do WhatsApp.
 * Retorna um Buffer do arquivo ou null se falhar.
 */
async function downloadMedia(mediaId) {
  try {
    console.log(`[WhatsApp] Iniciando download da mídia ID: ${mediaId}`);

    // 1️⃣ Primeiro: pegar a URL de download da mídia
    const infoRes = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${config.whatsapp.token}` },
    });

    if (!infoRes.ok) {
      console.error('❌ [WhatsApp] Falha ao obter URL da mídia:', await infoRes.text());
      return null;
    }

    const info = await infoRes.json();
    if (!info.url) {
      console.error('❌ [WhatsApp] Resposta inválida ao buscar info da mídia:', info);
      return null;
    }

    console.log(`[WhatsApp] URL de download obtida para mediaId ${mediaId}: ${info.url}`);

    // 2️⃣ Segundo: baixar o arquivo binário
    const mediaRes = await fetch(info.url, {
      headers: { Authorization: `Bearer ${config.whatsapp.token}` },
    });

    if (!mediaRes.ok) {
      console.error('❌ [WhatsApp] Falha ao baixar mídia:', await mediaRes.text());
      return null;
    }

    const arrayBuffer = await mediaRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`[WhatsApp] Download concluído para ${mediaId}. Tamanho: ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.error('❌ [WhatsApp] Erro ao baixar mídia:', error.message);
    return null;
  }
}

module.exports = { sendMessage, downloadMedia };
