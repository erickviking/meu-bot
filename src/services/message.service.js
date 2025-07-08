const supabase = require('./supabase.client');

const CHANNEL_NAME = 'realtime-chat';

async function saveMessage(messageData) {
    // LOG 1: Confirma que a função foi chamada e com quais dados.
    console.log('[MessageService] Função saveMessage iniciada com os dados:', messageData);

    if (!messageData.clinic_id) {
        console.error('[MessageService] ERRO: clinic_id está faltando. Abortando save.');
        return;
    }
    if (!messageData.content || messageData.content.trim() === '') {
        console.warn('[MessageService] AVISO: Conteúdo da mensagem está vazio. Abortando save.');
        return;
    }

    try {
        // LOG 2: Confirma que estamos prestes a executar a inserção.
        console.log('[MessageService] Executando Supabase insert...');
        const { data: newMessage, error } = await supabase
            .from('messages')
            .insert(messageData)
            .select()
            .single();

        // LOG 3: Se houver um erro do Supabase, loga o objeto de erro completo.
        if (error) {
            console.error('❌ [MessageService] ERRO DO SUPABASE:', JSON.stringify(error, null, 2));
            return;
        }

        // LOG 4: Se a inserção for bem-sucedida, loga os dados retornados.
        console.log('✅ [MessageService] Mensagem salva com sucesso. Resposta do DB:', newMessage);

        if (newMessage) {
            console.log('[MessageService] Anunciando mensagem no canal de broadcast...');
            const channel = supabase.channel(CHANNEL_NAME);
            await channel.send({
                type: 'broadcast',
                event: 'new_message',
                payload: newMessage,
            });
            console.log('📢 [MessageService] Mensagem anunciada com sucesso.');
        }

    } catch (err) {
        // LOG 5: Se ocorrer um erro inesperado no bloco try/catch.
        console.error('❌ [MessageService] ERRO FATAL NO TRY/CATCH:', JSON.stringify(err, null, 2));
    }
}

module.exports = { saveMessage };
