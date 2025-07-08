const supabase = require('./supabase.client');

/**
 * Busca a configuração completa de uma clínica no banco de dados
 * com base no ID do número de telefone do WhatsApp.
 * @param {string} whatsappPhoneId - O ID do número de telefone fornecido pela Meta.
 * @returns {object | null} O objeto de configuração da clínica ou null se não for encontrado.
 */
async function getClinicConfigByWhatsappId(whatsappPhoneId) {
    if (!whatsappPhoneId) {
        console.error('❌ ID do WhatsApp não fornecido para buscar a clínica.');
        return null;
    }

    try {
        const { data, error } = await supabase
            .from('clinics')
            // <<< 1. CORREÇÃO AQUI: Adicionamos 'id' à lista de colunas selecionadas.
            .select('id, doctor_name, secretary_name, knowledge_base')
            .eq('whatsapp_phone_id', whatsappPhoneId)
            .single();

        if (error) {
            console.error(`🚨 Erro ao buscar clínica para o ID ${whatsappPhoneId}:`, error.message);
            return null;
        }

        if (data) {
            // Renomeia os campos e inclui o ID no objeto retornado.
            return {
                // <<< 2. CORREÇÃO AQUI: Incluímos o 'id' no objeto de retorno.
                id: data.id, 
                doctorName: data.doctor_name,
                secretaryName: data.secretary_name,
                knowledgeBase: data.knowledge_base
            };
        }

        return null;

    } catch (err) {
        console.error('❌ Erro fatal no serviço da clínica:', err);
        return null;
    }
}

module.exports = { getClinicConfigByWhatsappId };
