// File: src/services/message.service.js

const supabase = require('./supabase.client');

// Canal base para mensagens em tempo real
const BASE_CHANNEL_NAME = 'realtime-chat';

/**
 * Salva uma mensagem no banco e envia broadcast pelo canal realtime.
 * 
 * - Se for uma mensagem manual do frontend (`sender: 'manual'` e `direction: 'outbound'`),
 *   desativa a IA do paciente e atualiza `last_manual_message_at`.
 * - Mensagens da IA (`sender: 'ai'`) ou do paciente (`sender: 'patient'`) não pausam a IA.
 */
async function saveMessage(messageData) {
    console.log('[MessageService] Função saveMessage iniciada:', messageData);

    // 🔹 Validação de dados obrigatórios
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

        // 2️⃣ Pausar IA SOMENTE para mensagens outbound manuais
        if (messageData.direction === 'outbound' && messageData.sender === 'manual') {
            try {
                const now = new Date().toISOString();
                await supabase
                    .from('patients')
                    .update({
                        is_ai_active: false,
                        last_manual_message_at: now,
                    })
                    .eq('phone', messageData.patient_phone)
                    .eq('clinic_id', messageData.clinic_id);

                console.log(`[MessageService] IA desativada (mensagem manual) e last_manual_message_at atualizado para ${now} para ${messageData.patient_phone}`);
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
 * diretamente via Supabase, garantindo que a IA tenha um "reset" real.
 */
async function clearConversationHistory(patientPhone, clinicId) {
    console.log(`[Service] Solicitando limpeza de histórico para ${patientPhone}`);
    try {
        // 1️⃣ Apagar mensagens
        const { error: msgError } = await supabase
            .from('messages')
            .delete()
            .eq('patient_phone', patientPhone)
            .eq('clinic_id', clinicId);
        if (msgError) throw msgError;

        // 2️⃣ Apagar resumos
        const { error: summaryError } = await supabase
            .from('conversation_summaries')
            .delete()
            .eq('phone', patientPhone)
            .eq('clinic_id', clinicId);
        if (summaryError) throw summaryError;

        console.log(`[Service] Histórico para ${patientPhone} limpo com sucesso.`);
        return true;

    } catch (error) {
        console.error(`❌ Erro ao limpar histórico para ${patientPhone}:`, error.message);
        return false;
    }
}

module.exports = { saveMessage, clearConversationHistory };
