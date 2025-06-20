// src/handlers/nepq.handler.js
const { detectSimpleIntent, getRandomResponse, extractFirstName } = require('../utils/helpers');
const { isEmergency, getEmergencyResponse } = require('../utils/emergencyDetector');

// Esta função agora é o "cérebro" da conversa.
async function handleConversationFlow(session, message) {
    try {
        const intent = detectSimpleIntent(message);

        // Tratamento de interrupções primeiro
        if (intent === 'valores' && session.nepqStage !== 'closing') {
            return `Claro, ${session.firstName}. O valor da consulta é R$${process.env.CONSULTA_VALOR || '400'}. Mas, para garantir que podemos te ajudar, me conte um pouco sobre o que te trouxe aqui.`;
        }
        if (intent === 'convenio' && session.nepqStage !== 'closing') {
            return `Entendi, ${session.firstName}. O Dr. Quelson atende apenas na modalidade particular para garantir a qualidade e o tempo da consulta. Fornecemos recibo para reembolso. Mas o mais importante é entender seu problema. O que te motivou a nos procurar?`;
        }
        if (intent === 'emergencia') {
            return getEmergencyResponse(session.firstName);
        }

        let reply = '';
        const stage = session.nepqStage;

        // Máquina de Estados NEPQ explícita
        switch (stage) {
            case 'situation_start':
                session.problemDescription = message;
                reply = `Entendi, ${session.firstName}. E há quanto tempo você sente isso?`;
                session.nepqStage = 'problem_duration';
                break;

            case 'problem_duration':
                session.problemDuration = message;
                reply = `Nossa... deve ser bem difícil lidar com isso 😔\nE nesse tempo, você sente que tem piorado ou se manteve igual?`;
                session.nepqStage = 'problem_worsening';
                break;

            case 'problem_worsening':
                session.problemWorsening = message;
                reply = `Compreendo. Você já tentou resolver de alguma forma, como passar com outro médico ou usar alguma medicação?`;
                session.nepqStage = 'problem_tried_solutions';
                break;

            case 'problem_tried_solutions':
                session.triedSolutions = message;
                reply = `Certo. E me diga, ${session.firstName}, esse incômodo já chegou a atrapalhar sua rotina? Por exemplo, seu sono, trabalho ou alimentação?`;
                session.nepqStage = 'implication_impact';
                break;

            case 'implication_impact':
                session.problemImpact = message;
                reply = `Imagino como isso desgasta, não só fisicamente, mas emocionalmente 😞\nAgora, vamos pensar no contrário... Se você pudesse se livrar disso e voltar a ter paz, como seria sua vida? ✨`;
                session.nepqStage = 'solution_visualization';
                break;

            case 'solution_visualization':
                reply = `É exatamente para te ajudar a chegar nesse resultado que o Dr. Quelson se dedica, ${session.firstName}.\n\nO que os pacientes mais dizem é que, pela primeira vez, sentiram que alguém realmente parou para investigar a fundo a causa do problema, sem pressa.\n\nO objetivo é evitar meses de sofrimento com tratamentos que só aliviam o sintoma. Gostaria de agendar uma consulta para começar esse processo de melhora?`;
                session.nepqStage = 'closing';
                break;

            case 'closing':
                if (intent === 'positiva' || intent === 'agendar') {
                    reply = `Ótimo, ${session.firstName}! Fico feliz em te ajudar a dar esse passo. Para facilitar, qual seria o melhor dia e período (manhã/tarde) para você? Vou verificar os horários disponíveis.`;
                    session.nepqStage = 'scheduling';
                } else {
                    reply = `Tudo bem, ${session.firstName}. Entendo que é uma decisão importante. Se precisar de mais alguma informação ou mudar de ideia, estarei por aqui. Cuide-se!`;
                }
                break;

            case 'scheduling':
                reply = `Perfeito! Recebi sua preferência por **${message}**. Vou confirmar na agenda do Dr. Quelson e te retorno em instantes com as opções de horário exatas. Só um momento, por favor.`;
                break;

            default:
                reply = `Desculpe, ${session.firstName}, não entendi. Pode reformular, por favor?`;
                break;
        }
        return reply;

    } catch (error) {
        console.error('🚨 Erro crítico em handleConversationFlow:', error);
        const safeName = (session && session.firstName) || 'amigo(a)';
        return `Desculpe, ${safeName}, estou com uma dificuldade técnica. Por favor, ligue para ${process.env.CONTACT_PHONE || '(XX) XXXX-XXXX'}.`;
    }
}

// Handler para a primeira interação, antes de ter o nome do usuário.
function handleInitialMessage(session, message) {
    if (!session.askedName) {
        session.askedName = true;
        return `Olá! Bem-vindo(a) ao consultório do Dr. Quelson. Sou a secretária virtual. Com quem eu falo, por gentileza? 😊`;
    } else {
        session.firstName = extractFirstName(message);
        return getRandomResponse([
            `Oi, ${session.firstName}! É um prazer falar com você 😊\nSó pra eu te ajudar da melhor forma, pode me contar rapidinho o que está te incomodando? 🙏`,
            `Oi, ${session.firstName}! Tudo bem? Antes de falarmos de horários, posso entender um pouco do que está acontecendo? Assim consigo te orientar melhor 🧡`
        ]);
    }
}


module.exports = { handleConversationFlow, handleInitialMessage };
