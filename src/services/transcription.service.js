// File: src/services/transcription.service.js (Versão Corrigida e Robusta)
const { OpenAI } = require('openai');
const config = require('../config');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Transcreve um áudio usando OpenAI Whisper (whisper-1).
 * Aceita um Buffer (ex.: áudio baixado do WhatsApp em OGG/OPUS).
 *
 * @param {Buffer} buffer - Arquivo de áudio em buffer
 * @returns {Promise<string>} - Texto transcrito
 */
async function transcribeAudio(buffer) {
    try {
        if (!buffer || !Buffer.isBuffer(buffer)) {
            console.error('[TranscriptionService] Buffer inválido ou vazio.');
            return '';
        }

        // --- INÍCIO DA CORREÇÃO ---
        // Precisamos enviar o Buffer como um File/Blob para que o SDK interprete corretamente.
        // O OpenAI SDK aceita `{ file: Buffer, filename: 'nome.extensão' }`.
        const audioFile = {
            file: buffer,
            filename: 'audio.ogg', // Nome obrigatório para o parse correto
        };

        console.log(`[TranscriptionService] Iniciando transcrição... Tamanho do buffer: ${buffer.length} bytes`);

        const transcription = await openai.audio.transcriptions.create({
            file: audioFile, // 🔹 Agora passamos o objeto com filename
            model: 'whisper-1',
            // language: 'pt', // 🔹 Opcional: força a transcrição em português
        });
        // --- FIM DA CORREÇÃO ---

        const result = transcription?.text?.trim() || '';
        console.log(`[TranscriptionService] Transcrição concluída: "${result}"`);
        return result;
    } catch (error) {
        // Log detalhado para debugar respostas da API
        console.error('[TranscriptionService] Erro ao transcrever áudio:', error.response?.data || error.message);
        return '';
    }
}

module.exports = { transcribeAudio };
