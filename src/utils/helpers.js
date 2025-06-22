// src/utils/helpers.js

/**
 * Extrai de forma inteligente o primeiro nome de um texto, usando uma série de heurísticas em ordem de prioridade.
 * @param {string} text - O texto enviado pelo usuário.
 * @returns {string} O primeiro nome extraído ou um valor padrão 'Cliente'.
 */
function capitalizeFirstLetter(word) {
    if (!word) return '';
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Extrai de forma inteligente o primeiro nome de um texto, usando uma série de
 * heurísticas em ordem de prioridade. Incorpora a sanitização do texto.
 * @param {string} text - O texto enviado pelo usuário.
 * @returns {string|null} O primeiro nome extraído ou null se não for encontrado.
 */
function extractFirstName(text) {
    if (!text || typeof text !== 'string') return null;

    // 1. Sanitiza e Normaliza o texto para uma correspondência robusta.
    const lowerNormalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const originalWords = text.trim().split(/\s+/);

    // 2. Prioridade 1: Busca por frases explícitas como "meu nome e joao".
    const regex = /(?:meu nome e|sou o|sou a|aqui e o|aqui e a|me chamo|e o|e a|meu nome|sou|aqui e|chamo me)\s+([a-z]+)/;
    const match = lowerNormalized.match(regex);
    if (match && match[1]) {
        return capitalizeFirstLetter(match[1]);
    }

    // 3. Prioridade 2: Busca pelo padrão "[NOME] aqui".
    const lowerWords = lowerNormalized.split(/\s+/);
    if (lowerWords.length === 2 && lowerWords[1] === 'aqui') {
        // Retorna a palavra original (com acentos) antes da normalização.
        return capitalizeFirstLetter(originalWords[0]);
    }

    // 4. Prioridade 3: Se o usuário enviar apenas uma palavra.
    if (originalWords.length === 1) {
        const singleWord = originalWords[0];
        // Valida que não é uma saudação curta.
        if (singleWord.length > 2 && !['oi', 'ola', 'bom', 'boa'].includes(lowerNormalized)) {
            return capitalizeFirstLetter(singleWord);
        }
    }

    // 5. Prioridade 4 (Fallback Seguro): Se for uma frase curta (2 ou 3 palavras),
    // é mais provável que o nome esteja no final (ex: "Boa tarde, sou o João").
    if (originalWords.length > 1 && originalWords.length <= 3) {
        const lastWord = originalWords[originalWords.length - 1];
        if (lastWord.length > 2) {
            return capitalizeFirstLetter(lastWord);
        }
    }
    
    // Se nenhuma heurística confiável funcionar, retorna null para que o bot possa pedir clarificação.
    return null;
}


function getRandomResponse(responses) {
    if (!responses || responses.length === 0) return '';
    return responses[Math.floor(Math.random() * responses.length)];
}

function detectSimpleIntent(message) {
    const msg = message.toLowerCase().trim();
    if (msg.includes('valor') || msg.includes('preco') || msg.includes('custa')) return 'valores';
    if (msg.includes('convenio') || msg.includes('plano')) return 'convenio';
    if (msg.includes('sim') || msg.includes('ok') || msg.includes('claro') || msg.includes('pode') || msg.includes('gostaria') || msg.includes('quero')) return 'positiva';
    if (msg.includes('nao') || msg.includes('obrigado')) return 'negativa';
    if (msg.includes('agendar') || msg.includes('marcar') || msg.includes('consulta')) return 'agendar';
    return 'outra';
}

module.exports = {
    extractFirstName,
    getRandomResponse,
    detectSimpleIntent
};
