// src/handlers/nepq.handler.js

const config = require('../config');             // Importa a configuração principal (valores, chaves)
const responses = require('../config/responses');   // Importa os roteiros de resposta
const { detectSimpleIntent, extractFirstName } = require('../utils/helpers');
const { isEmergency, getEmergencyResponse } = require('../utils/emergencyDetector');

// Esta função agora é o "cérebro" da conversa.
async function handleConversationFlow(session, message) {
    try {
        const intent = detectSimpleIntent(message);

        // Tratamento de interrupções primeiro, usando a configuração
        if (intent === 'valores' && session.nepqStage !== 'closing') {
            return responses.handleValuesInterrupt(session.firstName, config.clinic.consultationValue);
        }
        if (intent === 'convenio' && session.nepqStage !== 'closing') {
            return responses.handleInsuranceInterrupt(session.firstName);
        }
        if (isEmergency(message)) {
            return getEmergencyResponse(session.firstName);
        }

        let reply = '';
        const stage = session.nepqStage;

        // Máquina de Estados NEPQ explícita, agora usando o módulo de respostas
        switch (stage) {
            case 'situation_start':
                session.problemDescription = message;
                reply = responses.askProblemDuration(session.firstName);
                session.nepqStage = 'problem_duration';
                break;

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
                // Aqui você pode adicionar lógica para parar a conversa ou aguardar confirmação
                break;

            default:
                reply = responses.askToRephrase(session.firstName);
                break;
        }
        return reply;

    } catch (error) {
        console.error('🚨 Erro crítico em handleConversationFlow:', error);
        const safeName = (session && session.firstName) || null;
        return responses.criticalError(safeName, config.clinic.contactPhone);
    }
}

// Handler para a primeira interação, também usando o módulo de respostas.
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
