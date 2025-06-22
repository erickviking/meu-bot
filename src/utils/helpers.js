/**
 * Retorna um item aleatório de um array.
 * @param {Array<string>} responses - Um array de respostas possíveis.
 * @returns {string} Uma resposta aleatória do array.
 */
function getRandomResponse(responses) {
    if (!responses || responses.length === 0) return '';
    return responses[Math.floor(Math.random() * responses.length)];
}

/**
 * Detecta intenções simples e diretas baseadas em palavras-chave.
 * Útil para desvios de fluxo ou interrupções específicas.
 * @param {string} message - A mensagem do usuário.
 * @returns {string} A intenção detectada.
 */
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
    getRandomResponse,
    detectSimpleIntent
};
