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
            .select('doctor_name, secretary_name, knowledge_base')
            .eq('whatsapp_phone_id', whatsappPhoneId)
            .single(); // .single() espera um único resultado ou retorna erro.

        if (error) {
            console.error(`🚨 Erro ao buscar clínica para o ID ${whatsappPhoneId}:`, error.message);
            return null;
        }

        // Renomeia os campos para o formato esperado pelo resto da aplicação, se necessário
        if (data) {
            return {
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
