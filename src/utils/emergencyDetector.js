// src/utils/emergencyDetector.js

function isEmergency(message) {
    const emergencyKeywords = [
        'infarto', 'ataque cardiaco', 'dor no peito forte', 'parada cardíaca',
        'não consigo respirar', 'falta de ar grave', 'sufocando',
        'avc', 'derrame', 'convulsão', 'desmaiei', 'inconsciente',
        'acidente', 'sangramento grave', 'muito sangue',
        'overdose', 'envenenamento', 'intoxicação',
        'emergencia', 'emergência', 'socorro', 'samu', 'ambulancia',
        'vou me matar', 'quero morrer', 'suicidio',
        'dor insuportável'
    ];
    const msg = message.toLowerCase().trim();
    return emergencyKeywords.some(keyword => msg.includes(keyword));
}

function getEmergencyResponse(firstName) {
    const name = firstName || 'amigo(a)';
    const contactPhone = process.env.CONTACT_PHONE || '(XX) XXXX-XXXX';
    return `🚨 ${name}, se você está passando por uma emergência médica, por favor, NÃO ESPERE.\n\nLIGUE IMEDIATAMENTE para o SAMU (192) ou vá ao pronto-socorro mais próximo.\n\nPara consultas não urgentes, retome o contato quando estiver em segurança.`;
}

module.exports = { isEmergency, getEmergencyResponse };
