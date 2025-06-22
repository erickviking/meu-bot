// src/utils/helpers.js

/**
 * Extrai de forma inteligente o primeiro nome de um texto, usando uma série de heurísticas em ordem de prioridade.
 * @param {string} text - O texto enviado pelo usuário.
 * @returns {string} O primeiro nome extraído ou um valor padrão 'Cliente'.
 */
function extractFirstName(text) {
    if (!text || typeof text !== 'string') return null;

    const cleanedText = text.trim().toLowerCase();
    const words = cleanedText.split(/\s+/);
    const capitalizedName = (name) => name.charAt(0).toUpperCase() + name.slice(1);

    // Prioridade 1: Busca por frases explícitas. Ex: "meu nome é joão", "aqui é joão".
    const explicitPattern = /(?:meu nome é|me chamo|sou o|sou a|aqui é)\s+([a-záàãâéêíóôõúç]+)/i;
    const explicitMatch = cleanedText.match(explicitPattern);
    if (explicitMatch && explicitMatch[1]) {
        return capitalizedName(explicitMatch[1]);
    }

    // Prioridade 2: Busca pelo padrão "[NOME] aqui". Resolve o caso de teste.
    if (words.length === 2 && words[1] === 'aqui') {
        return capitalizedName(words[0]);
    }

    // Prioridade 3: Se o usuário enviar apenas uma palavra, é provável que seja o nome.
    if (words.length === 1) {
        const singleWord = words[0].replace(/[^a-záàãâéêíóôõúç]/gi, '');
        if (singleWord.length > 2) { // Evita capturar "oi", "ok", etc.
            return capitalizedName(singleWord);
        }
    }
    
    // Prioridade 4 (Fallback): Se a frase tiver duas palavras, assume que a primeira é o nome.
    // Cobre "João Silva" e frases curtas como "É o João".
    if (words.length === 2) {
         const firstWord = words[0].replace(/[^a-záàãâéêíóôõúç]/gi, '');
         if (firstWord && firstWord.length > 2) {
              return capitalizedName(firstWord);
         }
    }
    
    // Se nenhuma heurística funcionar, retorna null para indicar que o nome não foi encontrado.
    return null;
}


function getRandomResponse(responses) {
    if (!responses || responses.length === 0) return '';
    return responses[Math.floor(Math.random() * responses.length)];
}

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
