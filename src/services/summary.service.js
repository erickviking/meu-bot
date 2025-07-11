// File: src/services/summary.service.js

const { OpenAI } = require('openai');
const config = require('../config');
const supabase = require('./supabase.client');

// Inicializa o cliente OpenAI
const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Gera um resumo da conversa, USANDO A BASE DE CONHECIMENTO DA CLÍNICA.
 * @param {string} patientPhone - O número de telefone do paciente.
 * @param {string} clinicId - O UUID da clínica.
 * @returns {Promise<object>} O objeto do resumo salvo ou um objeto com { error } em caso de falha.
 */
async function generateAndSaveSummary(patientPhone, clinicId) {
  console.log(`[SummaryService] Iniciando resumo para ${patientPhone} na clínica ${clinicId}.`);

  try {
    // ETAPA 1: Buscar a base de conhecimento
    const { data: clinicData, error: clinicError } = await supabase
      .from('clinics')
      .select('knowledge_base')
      .eq('id', clinicId)
      .single();

    if (clinicError) {
      throw new Error(`Falha ao buscar knowledge_base: ${clinicError.message}`);
    }

    const knowledgeBaseContext = clinicData.knowledge_base
      ? JSON.stringify(clinicData.knowledge_base, null, 2)
      : 'Nenhuma informação específica fornecida.';

    // ETAPA 2: Buscar mensagens
    const { data: messages, error: msgError } = await supabase
      .from('messages')
      .select('content, direction')
      .eq('patient_phone', patientPhone)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: true })
      .limit(30);

    if (msgError || !messages || messages.length === 0) {
      console.warn(`[SummaryService] Nenhuma mensagem encontrada para ${patientPhone}.`);
      return { error: 'Sem mensagens para gerar resumo.' };
    }

    const conversationText = messages
      .map(m => `${m.direction === 'inbound' ? 'Paciente' : 'Secretária'}: ${m.content}`)
      .join('\n');

    // ETAPA 3: Criar prompt
    const summaryPrompt = `
CONTEXTO DA CLÍNICA (use estas informações como sua base da verdade):
${knowledgeBaseContext}
---

Com base no contexto da clínica acima e no histórico da conversa a seguir, você é uma secretária médica. Sua tarefa é gerar um resumo objetivo em texto corrido (máximo de 5 linhas). Destaque:
- Nome e queixa principal do paciente.
- Se deseja marcar consulta e qual especialidade.
- Dúvidas, objeções ou próximos passos.

Histórico da Conversa:
${conversationText}
    `;

    // ETAPA 4: Chamada à OpenAI
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: summaryPrompt }],
      temperature: 0.2,
      max_tokens: 250,
    });

    const summaryText = response.choices[0].message.content.trim();

    // ETAPA 5: Salvar no Supabase
    const { data: savedSummary, error: summaryError } = await supabase
      .from('conversation_summaries')
      .upsert(
        {
          phone: patientPhone,
          clinic_id: clinicId,
          summary: summaryText,
          updated_at: new Date(),
        },
        { onConflict: 'phone,clinic_id' }
      )
      .select()
      .single();

    if (summaryError) {
      throw new Error(`Erro ao salvar resumo: ${summaryError.message}`);
    }

    console.log(`[SummaryService] Resumo salvo com sucesso para ${patientPhone}.`);
return { summary: summaryText };

  } catch (error) {
    console.error("❌ Erro interno ao gerar resumo:", error);
    return { error: error.message || "Erro desconhecido." };
  }
}

console.log("✅ Função generateAndSaveSummary definida:", typeof generateAndSaveSummary);

module.exports = { generateAndSaveSummary };
