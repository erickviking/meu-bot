// src/utils/helpers.js

function extractFirstName(text) {
    if (!text || typeof text !== 'string') return 'Paciente';
    const name = text.trim().split(' ')[0];
    const safeName = name.replace(/[^a-zA-ZÀ-ú]/g, '');
    return safeName.charAt(0).toUpperCase() + safeName.slice(1);
}

function getRandomResponse(responses) {
    if (!responses || responses.length === 0) return '';
    return responses[Math.floor(Math.random() * responses.length)];
}

// Detector de intenção simples para guiar o bot em interrupções.
function detectSimpleIntent(message) {
    const msg = message.toLowerCase().trim();
    if (msg.includes('valor') || msg.includes('preço') || msg.includes('custa')) return 'valores';
    if (msg.includes('convênio') || msg.includes('convenio') || msg.includes('plano')) return 'convenio';
    if (msg.includes('sim') || msg.includes('ok') || msg.includes('claro') || msg.includes('pode') || msg.includes('gostaria') || msg.includes('quero')) return 'positiva';
    if (msg.includes('não') || msg.includes('nao') || msg.includes('obrigado')) return 'negativa';
    if (msg.includes('agendar') || msg.includes('marcar') || msg.includes('consulta')) return 'agendar';
    return 'outra';
}

module.exports = {
    extractFirstName,
    getRandomResponse,
    detectSimpleIntent
};
