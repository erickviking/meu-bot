// File: src/services/transcription.service.js (Versão Corrigida)
const { OpenAI, toFile } = require('openai');
const config = require('../config');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

async function transcribeAudio(buffer) {
    try {
        // --- INÍCIO DA CORREÇÃO ---
        // A API espera um objeto que se pareça com um arquivo.
        // Nós damos um nome genérico ao arquivo, pois ele é transitório.
        const audioFile = await toFile(buffer, 'audio.ogg'); // O nome é necessário para a API
        // --- FIM DA CORREÇÃO ---

        const transcription = await openai.audio.transcriptions.create({
            file: audioFile, // Passamos o buffer
            // A API infere o tipo, mas podemos ser explícitos se necessário.
            // name: audioFile.name,
            model: 'whisper-1'
        });

        return transcription.text?.trim() || '';
    } catch (error) {
        console.error('[TranscriptionService] Erro ao transcrever áudio:', error.message);
        return '';
    }
}

module.exports = { transcribeAudio };
