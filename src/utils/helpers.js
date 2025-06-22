// src/utils/helpers.js

/**
 * Capitaliza a primeira letra de uma palavra.
 * @param {string} word - A palavra a ser capitalizada.
 * @returns {string} A palavra formatada.
 */
function capitalizeFirstLetter(word) {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Extrai de forma inteligente o primeiro nome de um texto, usando heurísticas.
 * @param {string} text - O texto enviado pelo usuário.
 * @returns {string|null} O primeiro nome extraído ou null se não for encontrado.
 */
function extractFirstName(text) {
    if (!text || typeof text !== 'string') return null;

    const lowerNormalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const originalWords = text.trim().split(/\s+/);

    const regex = /(?:meu nome e|sou o|sou a|aqui e o|aqui e a|me chamo|e o|e a|meu nome|sou|aqui e|chamo me)\s+([a-z]+)/;
    const match = lowerNormalized.match(regex);
    if (match && match[1]) {
        return capitalizeFirstLetter(match[1]);
    }

    if (originalWords.length === 1) {
        const singleWord = originalWords[0];
        if (singleWord.length > 2 && !['oi', 'ola', 'bom', 'boa'].includes(lowerNormalized)) {
            return capitalizeFirstLetter(singleWord);
        }
    }

    if (originalWords.length > 1 && originalWords.length <= 3) {
        const lastWord = originalWords[originalWords.length - 1];
        if (lastWord.length > 2) {
            return capitalizeFirstLetter(lastWord);
        }
    }
    
    return null;
}

module.exports = {
    extractFirstName,
};
