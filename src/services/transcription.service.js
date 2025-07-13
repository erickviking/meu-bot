// File: src/services/transcription.service.js (Versão Corrigida)
const { OpenAI } = require('openai');
const config = require('../config');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

async function transcribeAudio(buffer) {
    try {
        // Converte o Buffer para um objeto compatível com arquivo antes da chamada
        // à API. O método `toFile` auxilia na geração do objeto esperado.
        const file = await OpenAI.toFile(buffer, 'audio.ogg');

        const transcription = await openai.audio.transcriptions.create({
            file,
            model: 'whisper-1'
        });

        return transcription.text?.trim() || '';
    } catch (error) {
        console.error('[TranscriptionService] Erro ao transcrever áudio:', error.message);
        return '';
    }
}

module.exports = { transcribeAudio };
