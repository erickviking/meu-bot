// File: src/services/message.service.js

const supabase = require('./supabase.client');

// Canal base para mensagens em tempo real
const BASE_CHANNEL_NAME = 'realtime-chat';

/**
 * Salva uma mensagem no banco e envia broadcast pelo canal realtime.
 * Se for uma mensagem manual do frontend (outbound), desativa a IA
 * do paciente e atualiza o timestamp de última mensagem manual.
 */
async function saveMessage(messageData) {
    console.log('[MessageService] Função saveMessage iniciada:', messageData);

    if (!messageData.clinic_id || !messageData.patient_phone) {
        console.error('[MessageService] ERRO: clinic_id e patient_phone são obrigatórios. Abortando.');
        return;
    }
    if (!messageData.content || messageData.content.trim() === '') {
        console.warn('[MessageService] AVISO: Conteúdo da mensagem está vazio. Abortando save.');
        return;
    }

    try {
        // 1️⃣ Salvar a mensagem no Supabase
        const { data: newMessage, error } = await supabase
            .from('messages')
            .insert(messageData)
            .select()
            .single();

        if (error) {
            console.error('❌ [MessageService] ERRO DO SUPABASE ao salvar:', JSON.stringify(error, null, 2));
            return;
        }

        console.log('✅ [MessageService] Mensagem salva com sucesso:', newMessage);

        // 2️⃣ Se for mensagem manual do frontend → desativa IA e marca horário
        if (messageData.direction === 'outbound') {
            try {
                const now = new Date().toISOString();
                await supabase
                    .from('patients')
                    .update({
                        is_ai_active: false,
                        last_manual_message_at: now,
                    })
                    .eq('phone', messageData.patient_phone);

                console.log(`[MessageService] IA desativada e last_manual_message_at atualizado para ${now} para ${messageData.patient_phone}`);
            } catch (err) {
                console.error('[MessageService] ERRO ao atualizar status da IA do paciente:', err.message);
            }
        }

        // 3️⃣ Broadcast da mensagem no canal realtime do paciente
        if (newMessage) {
            const channelName = `${BASE_CHANNEL_NAME}:${newMessage.patient_phone}`;
            console.log(`[MessageService] Anunciando mensagem no canal dinâmico: "${channelName}"`);
            
            const channel = supabase.channel(channelName);

            await channel.send({
                type: 'broadcast',
                event: 'new_message',
                payload: newMessage,
            });

            console.log('📢 [MessageService] Mensagem anunciada com sucesso.');
        }

        return newMessage;

    } catch (err) {
        console.error('❌ [MessageService] ERRO FATAL NO TRY/CATCH:', JSON.stringify(err, null, 2));
    }
}

/**
 * Limpa todo o histórico de um paciente (mensagens e resumos)
 * chamando a função RPC no Supabase.
 * @param {string} patientPhone - O telefone do paciente a ser limpo.
 * @param {string} clinicId - O ID da clínica para garantir a segurança.
 */
async function clearConversationHistory(patientPhone, clinicId) {
    console.log(`[Service] Solicitando limpeza de histórico para ${patientPhone}`);
    try {
        const { error } = await supabase.rpc('clear_conversation_history', {
            p_patient_phone: patientPhone,
            p_clinic_id: clinicId
        });
        if (error) throw error;

        console.log(`[Service] Histórico para ${patientPhone} limpo com sucesso.`);
        return true;

    } catch (error) {
        console.error(`❌ Erro ao limpar histórico para ${patientPhone}:`, error.message);
        return false;
    }
}

module.exports = { saveMessage, clearConversationHistory };
