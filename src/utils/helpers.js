/**
 * Pega a primeira palavra de um texto e a capitaliza.
 * É simples de propósito, pois a validação de contexto agora ocorre no handler.
 * @param {string} text - O texto a ser formatado.
 * @returns {string|null} A primeira palavra formatada ou null se inválida.
 */
function formatAsName(text) {
    if (!text || typeof text !== 'string') return null;

    const firstWord = text.trim().split(/\s+/)[0];

    if (!firstWord || firstWord.length < 2) return null;
    
    const safeName = firstWord.replace(/[^a-zA-ZÀ-ú]/g, '');
    return safeName.charAt(0).toUpperCase() + safeName.slice(1).toLowerCase();
}

module.exports = {
    formatAsName,
};
