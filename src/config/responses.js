// src/config/responses.js

const { getRandomResponse } = require('../utils/helpers');

// Objeto que contém todos os textos da aplicação.
const responseScripts = {
    // Mensagens de saudação inicial
    initialGreeting: () => `Olá! Bem-vindo(a) ao consultório do Dr. Quelson. Sou a secretária virtual. Com quem eu falo, por gentileza? 😊`,
    
    // Mensagens após a identificação
    welcomeUser: (firstName) => getRandomResponse([
        `Oi, ${firstName}! É um prazer falar com você 😊\nSó pra eu te ajudar da melhor forma, pode me contar rapidinho o que está te incomodando? 🙏`,
        `Oi, ${firstName}! Tudo bem? Antes de falarmos de horários, posso entender um pouco do que está acontecendo? Assim consigo te orientar melhor 🧡`
    ]),

    // Respostas para interrupções
    handleValuesInterrupt: (firstName, valor) => `Claro, ${firstName}. O valor da consulta é R$${valor}. Mas, para garantir que podemos te ajudar, me conte um pouco mais sobre o que te trouxe aqui.`,
    handleInsuranceInterrupt: (firstName) => `Entendi, ${firstName}. O Dr. Quelson atende apenas na modalidade particular para garantir a qualidade e o tempo da consulta. Fornecemos recibo para reembolso. Mas o mais importante é entender seu problema. O que te motivou a nos procurar?`,

    // Perguntas do fluxo NEPQ
    askProblemDuration: (firstName) => `Entendi, ${firstName}. E há quanto tempo você sente isso?`,
    askProblemWorsening: (firstName) => `Nossa... deve ser bem difícil lidar com isso 😔\nE nesse tempo, você sente que tem piorado ou se manteve igual?`,
    askTriedSolutions: (firstName) => `Compreendo. Você já tentou resolver de alguma forma, como passar com outro médico ou usar alguma medicação?`,
    askImplicationImpact: (firstName) => `Certo. E me diga, ${firstName}, esse incômodo já chegou a atrapalhar sua rotina? Por exemplo, seu sono, trabalho ou alimentação?`,
    askSolutionVisualization: (firstName) => `Imagino como isso desgasta, não só fisicamente, mas emocionalmente também 😞\nAgora, vamos pensar no contrário... Se você pudesse se livrar disso e voltar a ter paz, como seria sua vida? ✨`,

    // Script de fechamento e oferta
    closingStatement: (firstName) => `É exatamente para te ajudar a chegar nesse resultado que o Dr. Quelson se dedica, ${firstName}.\n\nO que os pacientes mais dizem é que, pela primeira vez, sentiram que alguém realmente parou para investigar a fundo a causa do problema, sem pressa.\n\nO objetivo é evitar meses de sofrimento com tratamentos que só aliviam o sintoma. Gostaria de agendar uma consulta para começar esse processo de melhora?`,
    
    // Respostas para agendamento
    askSchedulingPreference: (firstName) => `Ótimo, ${firstName}! Fico feliz em te ajudar a dar esse passo. Para facilitar, qual seria o melhor dia e período (manhã/tarde) para você? Vou verificar os horários disponíveis.`,
    confirmSchedulingPreference: (preference) => `Perfeito! Recebi sua preferência por **${preference}**. Vou confirmar na agenda do Dr. Quelson e te retorno em instantes com as opções de horário exatas. Só um momento, por favor.`,

    // Mensagens genéricas e de erro
    askToRephrase: (firstName) => `Desculpe, ${firstName}, não entendi. Pode reformular, por favor?`,
    gracefulExit: (firstName) => `Tudo bem, ${firstName}. Entendo que é uma decisão importante. Se precisar de mais alguma informação ou mudar de ideia, estarei por aqui. Cuide-se!`,
    criticalError: (firstName, contactPhone) => `Desculpe, ${firstName || 'amigo(a)'}, estou com uma dificuldade técnica. Por favor, ligue para ${contactPhone}.`
};

module.exports = responseScripts;
