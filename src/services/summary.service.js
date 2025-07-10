// File: src/services/summary.service.js

const { OpenAI } = require('openai');
const config = require('../config');
const supabase = require('./supabase.client'); // Use o cliente singleton

// Inicializa o cliente OpenAI
const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Gera um resumo da conversa de um paciente e o salva/atualiza no Supabase.
 * @param {string} patientPhone - O número de telefone do paciente.
 * @param {string} clinicId - O UUID da clínica.
 * @returns {Promise<object|null>} O objeto do resumo salvo ou null em caso de erro.
 */
async function generateAndSaveSummary(patientPhone, clinicId) {
    console.log(`[SummaryService] Iniciando geração de resumo para ${patientPhone} na clínica ${clinicId}.`);

    // 1. Busca as últimas 30 mensagens para ter contexto suficiente.
    const { data: messages, error: msgError } = await supabase
        .from('messages')
        .select('content, direction')
        .eq('patient_phone', patientPhone)
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: true })
        .limit(30);

    if (msgError || !messages || messages.length === 0) {
        console.error(`[SummaryService] Falha ao buscar mensagens:`, msgError?.message || "Nenhuma mensagem encontrada.");
        return null;
    }

    // 2. Formata o histórico da conversa e monta o prompt.
    const conversationText = messages
        .map(m => `${m.direction === 'inbound' ? 'Paciente' : 'Secretária'}: ${m.content}`)
        .join('\n');
    
    const summaryPrompt = `
        Você é uma secretária médica. Gere um resumo da conversa destacando:
        - Nome e queixa do paciente
        - Se deseja marcar consulta e qual especialidade
        - Dúvidas, objeções ou próximos passos

        Formato curto e direto em texto corrido (máx. 5 linhas).

        Conversa:
        ${conversationText}
    `;

    // 3. Chama a API da OpenAI para gerar o resumo.
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [{ role: 'system', content: summaryPrompt }],
        temperature: 0.2, // Temperatura baixa para resumos mais factuais.
        max_tokens: 250,
    });

    const summaryText = response.choices[0].message.content.trim();

    // 4. Usa 'upsert' para criar ou sobrescrever o resumo no banco de dados.
    console.log(`[SummaryService] Salvando resumo no Supabase...`);
    const { data: savedSummary, error: summaryError } = await supabase
        .from('conversation_summaries')
        .upsert(
            { phone: patientPhone, clinic_id: clinicId, summary: summaryText, updated_at: new Date() },
            { onConflict: 'phone,clinic_id' } // Conflito na chave composta
        )
        .select()
        .single();

    if (summaryError) {
        console.error(`[SummaryService] Erro ao salvar resumo:`, summaryError);
        return null;
    }

    console.log(`[SummaryService] Resumo para ${patientPhone} salvo com sucesso.`);
    return savedSummary;
}

module.exports = { generateAndSaveSummary };
