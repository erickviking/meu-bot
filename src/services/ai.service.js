const { OpenAI } = require('openai');
const config = require('../config');
const promptBuilder = require('./promptBuilder');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Obtém a resposta principal da IA com base no estado atual da conversa.
 * @param {object} session - O objeto de sessão completo do utilizador.
 * @returns {Promise<string>} A resposta da IA.
 */
async function getAiResponse(session) {
    const recentMessages = session.conversationHistory.slice(-8);
    const recentHistoryString = recentMessages
        .map(m => `${m.role === 'user' ? 'Paciente' : 'Secretária'}: ${m.content}`)
        .join('\n');

    const systemPrompt = promptBuilder.buildPromptForClinic(
        session.clinicConfig,
        session,
        recentHistoryString
    );

    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: systemPrompt },
            ...recentMessages
        ],
        temperature: 0.7
    });

    return response.choices[0].message.content?.trim() ||
        'Não consegui processar a sua mensagem. Pode repetir?';
}

/**
 * Gera um novo resumo da conversa usando um modelo mais rápido e barato.
 * @param {Array} conversationHistory - O array completo do histórico da conversa.
 * @returns {Promise<string>} O texto do resumo atualizado.
 */
async function getUpdatedSummary(conversationHistory) {
    if (conversationHistory.length === 0) return '';

    const conversationForSummary = conversationHistory
        .map(m => `${m.role === 'user' ? 'Paciente' : 'Secretária'}: ${m.content}`)
        .join('\n');

    const summaryPrompt = `
        Você é um assistente de resumo. Sua tarefa é criar um resumo conciso do histórico de conversa a seguir.
        Este resumo será usado como \"memória de longo prazo\" para outra IA. Destaque os pontos chave,
        dores do paciente, objeções e o estado atual da negociação.

        Histórico da Conversa:
        ${conversationForSummary}
    `;

    const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'system', content: summaryPrompt }],
        temperature: 0.1,
        max_tokens: 400
    });

    return response.choices[0].message.content?.trim() || '';
}

module.exports = {
    getAiResponse,
    getUpdatedSummary
};
