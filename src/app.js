import React, { useState } from 'react';
import ConversationList from './components/ConversationList';
import ChatView from './components/ChatView';
import './App.css';

function App() {
    // Estado para guardar qual paciente está selecionado na lista
    const [selectedPatient, setSelectedPatient] = useState(null);

    // O ID da clínica do administrador logado (por enquanto, fixo)
    const clinicIdForDemo = 'dd6a92e1-6ab5-4411-b752-d7f55151f293'; // Use o ID da sua clínica

    const handleSelectConversation = (patientPhone) => {
        setSelectedPatient(patientPhone);
    };

    return (
        <div className="App">
            <div className="crm-layout">
                <div className="sidebar">
                    <ConversationList 
                        clinicId={clinicIdForDemo}
                        onSelectConversation={handleSelectConversation}
                        selectedPatientPhone={selectedPatient}
                    />
                </div>
                <div className="main-content">
                    {selectedPatient ? (
                        <ChatView 
                            patientPhone={selectedPatient} 
                            clinicId={clinicIdForDemo} 
                        />
                    ) : (
                        <div className="placeholder">
                            <h2>Selecione uma conversa para começar</h2>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;
