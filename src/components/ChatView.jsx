// File: src/components/ChatView.jsx
// Description: Versão final e otimizada do componente, incorporando Skeleton Loader e busca de dados paralela.

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import ChatViewSkeleton from './ChatViewSkeleton';
import './ChatView.css';

// --- SUB-COMPONENTES INTERNOS PARA MANTER O JSX LIMPO ---

const ChatMessage = ({ message }) => (
  <div className={`message-row ${message.direction}`}>
    <div className="message-bubble">
      <div className="message-content">
        <span>{message.content}</span>
      </div>
      <div className="message-meta">
        <span className="message-time">
          {message.created_at ? new Date(message.created_at).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }) : ''}
        </span>
      </div>
    </div>
  </div>
);

const SummarySidebar = ({ summary, isLoading, onGenerate }) => (
    <div className="summary-sidebar">
        <h4 className="summary-title">Resumo da Conversa</h4>
        <div className="summary-content">
            {isLoading ? (
                <p className="summary-loading">Carregando...</p>
            ) : (
                <p className="summary-text">{summary || 'Nenhum resumo gerado. Clique no botão para criar ou atualizar.'}</p>
            )}
        </div>
        <button onClick={onGenerate} className="generate-summary-button" disabled={isLoading}>
            {isLoading ? 'Gerando...' : 'Gerar / Atualizar Resumo'}
        </button>
    </div>
);


// --- COMPONENTE PRINCIPAL OTIMIZADO ---

const ChatView = ({ patientPhone, clinicId }) => {
  // --- ESTADOS DO COMPONENTE ---
  const [messages, setMessages] = useState([]);
  const [patientName, setPatientName] = useState('');
  const [status, setStatus] = useState('lead');
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [summary, setSummary] = useState('');
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);

  // --- REFS PARA CONTROLE DE DOM ---
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);

  // --- EFEITOS (LIFECYCLE) ---

  // Efeito para rolar para a última mensagem
  useEffect(() => {
    if (!loading) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  // Efeito principal para buscar todos os dados da conversa de forma otimizada
  useEffect(() => {
    if (!patientPhone || !clinicId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const fetchAllData = async () => {
        try {
            // As 3 buscas são disparadas em paralelo para economizar tempo
            const [messagesPromise, patientPromise, summaryPromise] = [
                supabase.from('messages').select('*').eq('patient_phone', patientPhone).eq('clinic_id', clinicId).order('created_at', { ascending: true }),
                supabase.from('patients').select('name, status').eq('phone', patientPhone).single(),
                supabase.from('conversation_summaries').select('summary').eq('phone', patientPhone).eq('clinic_id', clinicId).single()
            ];
            
            // Aguarda a finalização de todas as buscas
            const [{ data: messagesData, error: messagesError }, { data: patientData, error: patientError }, { data: summaryData, error: summaryError }] = await Promise.all([messagesPromise, patientPromise, summaryPromise]);

            // Processa os resultados, tratando possíveis erros de cada busca
            if (messagesError) throw messagesError;
            setMessages(messagesData || []);
            
            if (patientError && patientError.code !== 'PGRST116') throw patientError; // PGRST116 = "0 linhas encontradas", o que é ok.
            setPatientName(patientData?.name || patientPhone);
            setStatus(patientData?.status || 'lead');

            if (summaryError && summaryError.code !== 'PGRST116') throw summaryError;
            setSummary(summaryData?.summary || '');

        } catch (error) {
            console.error("❌ Erro ao buscar dados da conversa:", error.message);
            // Zera os estados em caso de erro para não mostrar dados antigos
            setMessages([]);
            setPatientName(patientPhone);
            setSummary('');
        } finally {
            setLoading(false);
            setIsSummaryLoading(false);
        }
    };

    fetchAllData();

    // Canal de Real-time para novas mensagens
    const channel = supabase.channel(`realtime-chat:${patientPhone}`).on('broadcast', { event: 'new_message' }, (response) => {
        const newMessage = response.payload;
        if (newMessage.patient_phone === patientPhone) {
          setMessages((current) => [...current, newMessage]);
        }
      }).subscribe();

    return () => supabase.removeChannel(channel);
  }, [patientPhone, clinicId]);

  // Efeito para auto-ajuste da altura do textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);


  // --- FUNÇÕES DE HANDLER ---

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    await supabase.from('messages').insert({
      content: inputValue.trim(),
      direction: 'outbound',
      patient_phone: patientPhone,
      clinic_id: clinicId,
    });
    setInputValue('');
  };

  const handleStatusChange = async (e) => {
    const newStatus = e.target.value;
    setStatus(newStatus);
    await supabase.from('patients').update({ status: newStatus }).eq('phone', patientPhone);
  };
  
const handleGenerateSummary = async () => {
  if (!patientPhone || !clinicId) {
    alert("Não é possível gerar resumo sem uma conversa ativa.");
    return;
  }

  setIsSummaryLoading(true);

  try {
    const apiUrl = import.meta.env.VITE_BACKEND_API_URL;

    if (!apiUrl) {
      throw new Error("A URL do backend não está configurada.");
    }

    const response = await fetch(`${apiUrl}/api/v1/conversations/${patientPhone}/summarize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json', // Evita erro 406
      },
      body: JSON.stringify({ clinicId }),
    });

    // 🔍 Verifica se a resposta tem conteúdo
    const contentLength = response.headers.get('content-length');
    if (!contentLength || parseInt(contentLength) === 0) {
      throw new Error("A API retornou resposta vazia.");
    }

    const parsed = await response.json();

    if (!response.ok) {
      throw new Error(parsed?.error || 'Erro desconhecido ao gerar o resumo.');
    }

    if (!parsed.summary) {
      throw new Error("Resumo não encontrado na resposta da API.");
    }

    setSummary(parsed.summary);
  } catch (err) {
    console.error("❌ Erro ao acionar a geração do resumo:", err);
    alert(`Erro ao gerar resumo: ${err.message}`);
  } finally {
    setIsSummaryLoading(false);
  }
};

  // --- RENDERIZAÇÃO DO COMPONENTE ---

  if (loading) {
    return <ChatViewSkeleton />;
  }

  return (
    <div className="chat-view-container">
      <div className="chat-main-panel">
        <div className="chat-header">
          <h3>{patientName}</h3>
          <select value={status} onChange={handleStatusChange}>
            <option value="lead">Lead</option>
            <option value="agendado">Agendado</option>
            <option value="perdido">Perdido</option>
            <option value="paciente">Paciente</option>
          </select>
        </div>

        <div className="chat-messages">
          {messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)}
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input">
          <form onSubmit={handleSendMessage}>
            <textarea
              ref={textareaRef}
              className="chat-textarea"
              placeholder="Digite uma mensagem para enviar..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              rows={1}
            />
            <button type="submit">Enviar</button>
          </form>
        </div>
      </div>

      <SummarySidebar 
        summary={summary}
        isLoading={isSummaryLoading}
        onGenerate={handleGenerateSummary}
      />
    </div>
  );
};

export default ChatView;
