const supabase = require('./supabase.client');

// Um nome único para o canal de comunicação em tempo real.
const CHANNEL_NAME = 'realtime-chat';

/**
 * Salva uma mensagem no banco de dados e anuncia no canal de broadcast.
 * @param {object} messageData - Os dados da mensagem a serem salvos.
 * @param {string} messageData.content - O texto da mensagem.
 * @param {string} messageData.direction - A direção ('inbound' ou 'outbound').
 * @param {string} messageData.patient_phone - O telefone do paciente.
 * @param {string} messageData.clinic_id - O ID da clínica (UUID).
 */
async function saveMessage(messageData) {
    // Validação para não tentar salvar se não houver um ID de clínica.
    if (!messageData.clinic_id) {
        console.error('❌ Tentativa de salvar mensagem sem clinic_id. Abortado.');
        return;
    }

    try {
        // Salva a mensagem e usa .select().single() para obter o registro salvo.
        const { data: newMessage, error } = await supabase
            .from('messages')
            .insert(messageData)
            .select()
            .single();

        if (error) {
            console.error('❌ Erro ao salvar mensagem no banco:', error.message);
            return;
        }

        // Se a mensagem foi salva com sucesso (newMessage não é nulo),
        // anuncie-a no canal de broadcast.
        if (newMessage) {
            const channel = supabase.channel(CHANNEL_NAME);
            await channel.send({
                type: 'broadcast',
                event: 'new_message',    // Nome do nosso evento customizado
                payload: newMessage,     // Enviamos a mensagem completa
            });
            console.log(`[Broadcast] Mensagem da direção '${newMessage.direction}' anunciada.`);
        }

    } catch (err) {
        console.error('❌ Erro fatal no message.service:', err);
    }
}

module.exports = { saveMessage };
