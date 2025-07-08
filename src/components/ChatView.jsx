import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import './ChatView.css'; // O CSS que estiliza as bolhas de mensagem

/**
 * Sub-componente para renderizar uma única bolha de mensagem.
 */
const ChatMessage = ({ message }) => (
    <div className={`message-row ${message.direction}`}>
        <div className="message-bubble">
            <div className="message-content">
                <span>{message.content}</span>
            </div>
            <div className="message-meta">
                <span className="message-time">
                    {new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                {/* No futuro, aqui podem entrar os ícones de status ✓✓ */}
            </div>
        </div>
    </div>
);


/**
 * Componente principal que exibe a conversa completa de um paciente.
 */
const ChatView = ({ patientPhone, clinicId }) => {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const messagesEndRef = useRef(null); // Referência para o final da lista de mensagens

    // Efeito para rolar a tela para a última mensagem sempre que a lista for atualizada.
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Efeito principal para buscar dados e escutar em tempo real.
    useEffect(() => {
        if (!patientPhone || !clinicId) return;

        // 1. Busca o histórico inicial de mensagens da conversa selecionada.
        const fetchMessages = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('messages')
                .select('*')
                .eq('patient_phone', patientPhone)
                .eq('clinic_id', clinicId)
                .order('created_at', { ascending: true });

            if (error) {
                console.error('Erro ao buscar mensagens:', error);
            } else {
                setMessages(data);
            }
            setLoading(false);
        };

        fetchMessages();

        // 2. Se inscreve para receber novas mensagens (anúncios do backend) em tempo real.
        const channel = supabase
            .channel('realtime-chat')
            .on(
                'broadcast',
                { event: 'new_message' },
                (response) => {
                    const newMessage = response.payload;
                    // Garante que a nova mensagem pertence a esta conversa aberta.
                    if (newMessage.patient_phone === patientPhone) {
                        setMessages(currentMessages => [...currentMessages, newMessage]);
                    }
                }
            )
            .subscribe();

        // 3. Função de limpeza.
        return () => {
            supabase.removeChannel(channel);
        };

    }, [patientPhone, clinicId]);

    if (loading) {
        return <div>Carregando histórico de mensagens...</div>;
    }

    return (
        <div className="chat-container">
            <div className="chat-messages">
                {messages.map(msg => (
                    <ChatMessage key={msg.id} message={msg} />
                ))}
                <div ref={messagesEndRef} />
            </div>
        </div>
    );
};

export default ChatView;
