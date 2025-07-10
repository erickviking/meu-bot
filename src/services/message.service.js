// File: src/services/message.service.js (Versão Corrigida)

const supabase = require('./supabase.client');

// O nome do canal base, que será combinado com o ID do paciente.
const BASE_CHANNEL_NAME = 'realtime-chat';

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

        if (newMessage) {
            // --- INÍCIO DA CORREÇÃO ---
            // Criamos um nome de canal dinâmico, específico para o paciente.
            // Ex: 'realtime-chat:551151995795'
            const channelName = `${BASE_CHANNEL_NAME}:${newMessage.patient_phone}`;
            console.log(`[MessageService] Anunciando mensagem no canal dinâmico: "${channelName}"`);
            
            const channel = supabase.channel(channelName);
            // --- FIM DA CORREÇÃO ---

            await channel.send({
                type: 'broadcast',
                event: 'new_message',
                payload: newMessage,
            });
            console.log('📢 [MessageService] Mensagem anunciada com sucesso.');
        }

    } catch (err) {
        console.error('❌ [MessageService] ERRO FATAL NO TRY/CATCH:', JSON.stringify(err, null, 2));
    }
}

module.exports = { saveMessage };
