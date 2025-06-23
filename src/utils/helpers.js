/**
 * Pega a primeira palavra de um texto e a capitaliza.
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

/**
 * Simula um atraso de digitação humano, com base no comprimento da resposta.
 * @param {string} text - O texto que o bot está prestes a enviar.
 */
function simulateTypingDelay(text) {
    // Calcula um delay dinâmico: 1 segundo base + 20ms por caractere.
    const typingDelay = 1000 + (text.length * 20);
    // Limita o delay máximo para não deixar o usuário esperando demais.
    const maxDelay = 4000; // 4 segundos
    const finalDelay = Math.min(typingDelay, maxDelay);

    return new Promise(resolve => setTimeout(resolve, finalDelay));
}

module.exports = {
    formatAsName,
    simulateTypingDelay,
};
