// src/utils/helpers.js

/**
 * Extrai de forma inteligente o primeiro nome de um texto.
 * Prioriza frases explícitas como "Meu nome é João" ou "Aqui é João".
 * Se não encontrar, assume que a última palavra de uma frase curta é o nome.
 * @param {string} text - O texto enviado pelo usuário.
 * @returns {string} O primeiro nome extraído ou um valor padrão.
 */
function extractFirstName(text) {
    if (!text || typeof text !== 'string') return 'Cliente';

    const cleanedText = text.trim().toLowerCase();

    // Padrão 1: Busca por frases explícitas. Ex: "meu nome é joão", "aqui é joão", "sou o joão"
    // Captura a palavra seguinte a essas expressões.
    const explicitPattern = /(?:meu nome é|aqui é|sou o|sou a|chamo-me|me chamo)\s+([a-záàãâéêíóôõúç]+)/i;
    const explicitMatch = cleanedText.match(explicitPattern);

    if (explicitMatch && explicitMatch[1]) {
        const name = explicitMatch[1];
        return name.charAt(0).toUpperCase() + name.slice(1);
    }

    // Padrão 2: Se não houver frase explícita, pega a última palavra da frase.
    // Isso funciona bem para casos como "Boa tarde, é o João" ou "Olá, sou eu, a Maria".
    const words = cleanedText.split(/\s+/);
    const lastWord = words[words.length - 1].replace(/[^a-záàãâéêíóôõúç]/gi, '');

    // Apenas considera a última palavra se ela tiver um tamanho razoável para um nome.
    if (lastWord.length > 2) {
        return lastWord.charAt(0).toUpperCase() + lastWord.slice(1);
    }
    
    // Padrão 3 (Fallback): Se a frase tiver apenas uma ou duas palavras, assume que a primeira é o nome.
    // Isso cobre o caso em que o usuário digita apenas "João" ou "João Silva".
    if (words.length <= 2) {
        const firstWord = words[0].replace(/[^a-záàãâéêíóôõúç]/gi, '');
        if (firstWord) {
             return firstWord.charAt(0).toUpperCase() + firstWord.slice(1);
        }
    }

    // Se nenhuma das heurísticas funcionar, retorna um padrão seguro.
    return 'Cliente';
}

function getRandomResponse(responses) {
    if (!responses || responses.length === 0) return '';
    return responses[Math.floor(Math.random() * responses.length)];
}

// O detector de intenção permanece o mesmo.
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
