// src/services/transcription.service.js
const { OpenAI } = require('openai');
const config = require('../config');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

async function transcribeAudio(buffer) {
    try {
        const transcription = await openai.audio.transcriptions.create({
            file: buffer,
            model: 'whisper-1'
        });
        return transcription.text?.trim() || '';
    } catch (error) {
        console.error('[TranscriptionService] Erro ao transcrever áudio:', error.message);
        return '';
    }
}

module.exports = { transcribeAudio };
