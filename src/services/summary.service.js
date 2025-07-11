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
 * @returns {Promise<object|null>} O objeto do resumo salvo ou null em caso de erro.
 */
async function generateAndSaveSummary(patientPhone, clinicId) {
    console.log(`[SummaryService] Iniciando resumo para ${patientPhone} na clínica ${clinicId}.`);

    try {
        // ETAPA 1: Buscar a base de conhecimento específica da clínica.
        const { data: clinicData, error: clinicError } = await supabase
            .from('clinics')
            .select('knowledge_base')
            .eq('id', clinicId)
            .single();

        if (clinicError) {
            throw new Error(`Falha ao buscar knowledge_base para a clínica ${clinicId}: ${clinicError.message}`);
        }

        const knowledgeBaseContext = clinicData.knowledge_base ? JSON.stringify(clinicData.knowledge_base, null, 2) : 'Nenhuma informação específica fornecida.';

        // ETAPA 2: Buscar o histórico de mensagens.
        const { data: messages, error: msgError } = await supabase
            .from('messages')
            .select('content, direction')
            .eq('patient_phone', patientPhone)
            .eq('clinic_id', clinicId)
            .order('created_at', { ascending: true })
            .limit(30);

        if (msgError || !messages || messages.length === 0) {
            console.error(`[SummaryService] Nenhuma mensagem encontrada para ${patientPhone}. Não há o que resumir.`);
            return null;
        }

        const conversationText = messages
            .map(m => `${m.direction === 'inbound' ? 'Paciente' : 'Secretária'}: ${m.content}`)
            .join('\n');
        
        // ETAPA 3: Montar o prompt, agora incluindo a base de conhecimento.
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

        // ETAPA 4: Chamar a OpenAI.
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'system', content: summaryPrompt }],
            temperature: 0.2,
            max_tokens: 250,
        });

        const summaryText = response.choices[0].message.content.trim();

        // ETAPA 5: Salvar o resumo no banco de dados.
        console.log(`[SummaryService] Salvando resumo no Supabase...`);
        const { data: savedSummary, error: summaryError } = await supabase
            .from('conversation_summaries')
            .upsert(
                { phone: patientPhone, clinic_id: clinicId, summary: summaryText, updated_at: new Date() },
                { onConflict: 'phone,clinic_id' }
            )
            .select()
            .single();

        if (summaryError) {
            throw new Error(`Erro ao salvar resumo no DB: ${summaryError.message}`);
        }

        console.log(`[SummaryService] Resumo para ${patientPhone} salvo com sucesso.`);
        return savedSummary;

    } catch (error) {
        console.error(`❌ Erro no fluxo de geração de resumo para ${patientPhone}:`, error.message);
        return null;
    }
}

module.exports = { generateAndSaveSummary };
