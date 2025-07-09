import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import './ConversationList.css';

const ConversationList = ({ clinicId, onSelectConversation, selectedPatientPhone }) => {
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterStatus, setFilterStatus] = useState('all');

    useEffect(() => {
        const fetchConversations = async () => {
            if (!clinicId) return;
            setLoading(true);

            const { data, error } = await supabase.rpc('get_latest_messages_per_patient', {
                target_clinic_id: clinicId
            });

            if (error) {
                console.error("Erro ao buscar lista de conversas:", error);
            } else {
                const filtered = filterStatus === 'all'
                    ? data
                    : data.filter(c => c.status === filterStatus);
                setConversations(filtered);
            }

            setLoading(false);
        };

        fetchConversations();

        const channel = supabase
            .channel('public:messages')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, fetchConversations)
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };

    }, [clinicId, filterStatus]);

    const getStatusIcon = (status) => {
        switch (status) {
            case 'agendado':
                return '✅';
            case 'perdido':
                return '❌';
            case 'lead':
            default:
                return '🟡';
        }
    };

    if (loading) return <div className="conversation-list-loading">Carregando conversas...</div>;

    return (
        <div className="conversation-list">
            <div className="list-header">
                <h2>Conversas</h2>
                <select
                    className="status-filter"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                >
                    <option value="all">Todas</option>
                    <option value="lead">🟡 Leads</option>
                    <option value="agendado">✅ Agendados</option>
                    <option value="perdido">❌ Perdidos</option>
                </select>
            </div>

            <div className="list-body">
                {conversations.map(convo => (
                    <div
                        key={convo.patient_phone}
                        className={`conversation-item ${convo.patient_phone === selectedPatientPhone ? 'selected' : ''}`}
                        onClick={() => onSelectConversation(convo.patient_phone)}
                    >
                        <div className="convo-info">
                            <div className="convo-header">
                                <span className="convo-phone">{convo.patient_phone}</span>
                                <span className="status-badge">
                                    {getStatusIcon(convo.status)} {convo.status?.toUpperCase()}
                                </span>
                            </div>
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
