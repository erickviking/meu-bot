import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './ConversationList.css'; // Criaremos este CSS a seguir

const ConversationList = ({ clinicId, onSelectConversation, selectedPatientPhone }) => {
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Função para buscar a última mensagem de cada conversa única
        const fetchConversations = async () => {
            if (!clinicId) return;
            setLoading(true);

            // Esta é a consulta SQL que usa a lógica DISTINCT ON
            const { data, error } = await supabase.rpc('get_latest_messages_per_patient', {
                target_clinic_id: clinicId
            });

            if (error) {
                console.error("Erro ao buscar lista de conversas:", error);
            } else {
                setConversations(data);
            }
            setLoading(false);
        };

        fetchConversations();

        // Também escutamos por novas mensagens para atualizar a lista
        const channel = supabase
            .channel('public:messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, fetchConversations)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };

    }, [clinicId]);

    if (loading) return <div className="conversation-list-loading">Carregando conversas...</div>;

    return (
        <div className="conversation-list">
            <div className="list-header">
                <h2>Conversas</h2>
            </div>
            <div className="list-body">
                {conversations.map(convo => (
                    <div
                        key={convo.patient_phone}
                        className={`conversation-item ${convo.patient_phone === selectedPatientPhone ? 'selected' : ''}`}
                        onClick={() => onSelectConversation(convo.patient_phone)}
                    >
                        <div className="convo-info">
                            <span className="convo-phone">{convo.patient_phone}</span>
                            <p className="convo-preview">{convo.content}</p>
                        </div>
                        <span className="convo-time">
                            {new Date(convo.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ConversationList;
