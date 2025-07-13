// File: src/services/message.service.js

const supabase = require('./supabase.client');
const logger = require('../utils/logger');

// O nome do canal base, que será combinado com o ID do paciente.
const BASE_CHANNEL_NAME = 'realtime-chat';

async function saveMessage(messageData) {
    logger.info('[MessageService] Função saveMessage iniciada:', messageData);

    if (!messageData.clinic_id || !messageData.patient_phone) {
        logger.error('[MessageService] ERRO: clinic_id e patient_phone são obrigatórios. Abortando.');
        return;
    }
    if (!messageData.content || messageData.content.trim() === '') {
        logger.warn('[MessageService] AVISO: Conteúdo da mensagem está vazio. Abortando save.');
        return;
    }

    try {
        const { data: newMessage, error } = await supabase
            .from('messages')
            .insert(messageData)
            .select()
            .single();

        if (error) {
            logger.error('❌ [MessageService] ERRO DO SUPABASE ao salvar:', JSON.stringify(error, null, 2));
            return;
        }

        logger.info('✅ [MessageService] Mensagem salva com sucesso:', newMessage);

        if (newMessage) {
            const channelName = `${BASE_CHANNEL_NAME}:${newMessage.patient_phone}`;
            logger.info(`[MessageService] Anunciando mensagem no canal dinâmico: "${channelName}"`);
            
            const channel = supabase.channel(channelName);

            await channel.send({
                type: 'broadcast',
                event: 'new_message',
                payload: newMessage,
            });
            logger.info('📢 [MessageService] Mensagem anunciada com sucesso.');
        }

    } catch (err) {
        logger.error('❌ [MessageService] ERRO FATAL NO TRY/CATCH:', JSON.stringify(err, null, 2));
    }
}


// --- INÍCIO DA ADIÇÃO ---
/**
 * Limpa todo o histórico de um paciente (mensagens e resumos)
 * chamando a função RPC no Supabase.
 * @param {string} patientPhone - O telefone do paciente a ser limpo.
 * @param {string} clinicId - O ID da clínica para garantir a segurança.
 */
async function clearConversationHistory(patientPhone, clinicId) {
    logger.info(`[Service] Solicitando limpeza de histórico para ${patientPhone}`);
    try {
        // CORREÇÃO: Garantimos que os nomes dos parâmetros correspondem
        // exatamente aos definidos na sua função SQL.
        const { error } = await supabase.rpc('clear_conversation_history', {
            p_patient_phone: patientPhone,
            p_clinic_id: clinicId
        });
        if (error) throw error;
        logger.info(`[Service] Histórico para ${patientPhone} limpo com sucesso.`);
        return true;
    } catch (error) {
        logger.error(`❌ Erro ao limpar histórico para ${patientPhone}:`, error.message);
        return false;
    }
}
// --- FIM DA ADIÇÃO ---


// --- ATUALIZAÇÃO DA EXPORTAÇÃO ---
// Agora exportamos as duas funções.
module.exports = { saveMessage, clearConversationHistory };
