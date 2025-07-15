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
        const { data: clinic, error: clinicError } = await supabase
            .from('clinics')
            .select('id, doctor_name, secretary_name, knowledge_base')
            .eq('whatsapp_phone_id', whatsappPhoneId)
            .single();

        if (clinicError) {
            console.error(`🚨 Erro ao buscar clínica para o ID ${whatsappPhoneId}:`, clinicError.message);
            return null;
        }

        if (clinic) {
            let calendarId = null;

            const { data: settings, error: settingsError } = await supabase
                .from('clinic_settings')
                .select('google_calendar_id')
                .eq('clinic_id', clinic.id)
                .single();

            if (settingsError && settingsError.code !== 'PGRST116') {
                console.error(`🚨 Erro ao buscar settings para a clínica ${clinic.id}:`, settingsError.message);
            }

            if (settings) {
                calendarId = settings.google_calendar_id;
            }

            return {
                id: clinic.id,
                doctorName: clinic.doctor_name,
                secretaryName: clinic.secretary_name,
                knowledgeBase: clinic.knowledge_base,
                google_calendar_id: calendarId
            };
        }

        return null;

    } catch (err) {
        console.error('❌ Erro fatal no serviço da clínica:', err);
        return null;
    }
}

module.exports = { getClinicConfigByWhatsappId };
