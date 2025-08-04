// File: src/services/transcription.service.js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { OpenAI } = require('openai');
const config = require('../config');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Salva temporariamente o buffer em disco e retorna o caminho do arquivo.
 */
function saveTempAudioFile(buffer, extension = 'ogg') {
    const tempDir = os.tmpdir();
    const filename = `audio_${Date.now()}.${extension}`;
    const filePath = path.join(tempDir, filename);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

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

        console.log(`[TranscriptionService] Iniciando transcrição... Tamanho do buffer: ${buffer.length} bytes`);

        // 1️⃣ Salvar arquivo temporário
        const tempFilePath = saveTempAudioFile(buffer, 'ogg');
        console.log(`[TranscriptionService] Arquivo temporário salvo em: ${tempFilePath}`);

        // 2️⃣ Criar stream para enviar para OpenAI
        const fileStream = fs.createReadStream(tempFilePath);

        // 3️⃣ Enviar para Whisper
        const transcription = await openai.audio.transcriptions.create({
            file: fileStream,
            model: 'whisper-1',
            // language: 'pt', // opcional: força PT-BR
        });

        const result = transcription?.text?.trim() || '';
        console.log(`[TranscriptionService] Transcrição concluída: "${result}"`);

        // 4️⃣ Apagar arquivo temporário
        try {
            fs.unlinkSync(tempFilePath);
            console.log(`[TranscriptionService] Arquivo temporário removido: ${tempFilePath}`);
        } catch (cleanupErr) {
            console.warn(`[TranscriptionService] Falha ao remover arquivo temporário: ${cleanupErr.message}`);
        }

        return result;
    } catch (error) {
        console.error('[TranscriptionService] Erro ao transcrever áudio:', error.response?.data || error.message);
        return '';
    }
}

module.exports = { transcribeAudio };
