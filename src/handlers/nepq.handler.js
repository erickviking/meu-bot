// src/handlers/nepq.handler.js

const config = require('../config');
const responses = require('../config/responses');
const { detectSimpleIntent, extractFirstName } = require('../utils/helpers');
const { isEmergency, getEmergencyResponse } = require('../utils/emergencyDetector');

async function handleConversationFlow(session, message) {
    try {
        const intent = detectSimpleIntent(message);

        // --- LÓGICA DE TRATAMENTO DE INTERRUPÇÕES MELHORADA ---
        if (isEmergency(message)) {
            return getEmergencyResponse(session.firstName);
        }
        if (intent === 'valores' && session.nepqStage !== 'closing') {
            return responses.handleValuesInterrupt(session.firstName, config.clinic.consultationValue);
        }
        if (intent === 'convenio' && session.nepqStage !== 'closing') {
            return responses.handleInsuranceInterrupt(session.firstName);
        }
        // NOVO: Lida com saudações a qualquer momento para quebrar loops
        if (intent === 'saudacao' && session.nepqStage !== 'situation_start') {
            return `Olá, ${session.firstName}! Estávamos conversando sobre o seu problema. Se quiser continuar, pode me responder à última pergunta. Se preferir, podemos recomeçar.`;
        }
        
        // --- MÁQUINA DE ESTADOS NEPQ ROBUSTA ---
        let reply = '';
        const stage = session.nepqStage;

        switch (stage) {
            case 'situation_start':
                session.problemDescription = message;
                reply = responses.askProblemDuration(session.firstName);
                session.nepqStage = 'problem_duration';
                break;
            // ... (outros cases do NEPQ continuam iguais)
            case 'problem_duration':
                session.problemDuration = message;
                reply = responses.askProblemWorsening(session.firstName);
                session.nepqStage = 'problem_worsening';
                break;
            case 'problem_worsening':
                session.problemWorsening = message;
                reply = responses.askTriedSolutions(session.firstName);
                session.nepqStage = 'problem_tried_solutions';
                break;
            case 'problem_tried_solutions':
                session.triedSolutions = message;
                reply = responses.askImplicationImpact(session.firstName);
                session.nepqStage = 'implication_impact';
                break;
            case 'implication_impact':
                session.problemImpact = message;
                reply = responses.askSolutionVisualization(session.firstName);
                session.nepqStage = 'solution_visualization';
                break;
            case 'solution_visualization':
                reply = responses.closingStatement(session.firstName);
                session.nepqStage = 'closing';
                break;
            case 'closing':
                if (intent === 'positiva' || intent === 'agendar') {
                    reply = responses.askSchedulingPreference(session.firstName);
                    session.nepqStage = 'scheduling';
                } else {
                    reply = responses.gracefulExit(session.firstName);
                }
                break;
            case 'scheduling':
                reply = responses.confirmSchedulingPreference(message);
                break;

            // NOVO: Default case mais inteligente
            default:
                session.repeatCount = (session.repeatCount || 0) + 1;
                if (session.repeatCount > 2) {
                    reply = `Parece que não estamos nos entendendo. Que tal ligar para ${config.clinic.contactPhone}? Assim podemos resolver mais rápido. Se preferir continuar por aqui, me diga o motivo do seu contato.`;
                    // Opcional: resetar o estágio para um novo começo
                    session.nepqStage = 'situation_start'; 
                    session.repeatCount = 0;
                } else {
                    reply = responses.askToRephrase(session.firstName);
                }
                break;
        }
        return reply;

    } catch (error) {
        console.error('🚨 Erro crítico em handleConversationFlow:', error);
        const safeName = (session && session.firstName) || null;
        return responses.criticalError(safeName, config.clinic.contactPhone);
    }
}

function handleInitialMessage(session, message) {
    if (!session.askedName) {
        session.askedName = true;
        return responses.initialGreeting();
    } else {
        session.firstName = extractFirstName(message);
        return responses.welcomeUser(session.firstName);
    }
}

module.exports = { handleConversationFlow, handleInitialMessage };
