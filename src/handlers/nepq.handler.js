const config = require('../config');
const { OpenAI } = require('openai');
const { formatAsName } = require('../utils/helpers');

const openai = new OpenAI({ apiKey: config.openai.apiKey });

// O template base do prompt, com placeholders para personalização.
const systemPromptTemplate = `
### CONSULTA À BASE DE CONHECIMENTO [NOVA DIRETRIZ CRÍTICA]
Se, a qualquer momento, o paciente perguntar sobre condições específicas tratadas, exames, procedimentos ou preços, sua primeira ação é consultar a seção "BASE DE CONHECIMENTO DA CLÍNICA" abaixo.
1.  **Se a informação existir:** Responda à pergunta do paciente de forma direta e prestativa, usando os dados da base de conhecimento. Em seguida, retome o fluxo NEPQ com uma pergunta empática.
2.  **Se a informação NÃO existir:** Seja honesta. Diga: "Essa é uma excelente pergunta. Não tenho essa informação específica aqui, mas posso verificar para você. Para continuarmos, pode me contar um pouco mais sobre o que te incomoda?".

### BASE DE CONHECIMENTO DA CLÍNICA
{{knowledgeBase}}
#######################################

### REGRAS DE OURO DA CONVERSA
1.  **UMA PERGUNTA DE CADA VEZ:** Mantenha o foco.
2.  **PIVÔ EMPÁTICO:** Se o paciente perguntar sobre preço/convênio antes do Fechamento, NÃO responda diretamente. Valide a pergunta e explique que precisa entender o caso primeiro para dar o melhor direcionamento.
3.  **SEJA HUMANO:** Use o nome do paciente. Mantenha as respostas curtas.

### FLUXO ESTRATÉGICO NEPQ
As etapas 1 a 5 servem para coletar informações.
## 1. SITUAÇÃO: Entenda o cenário.
## 2. PROBLEMA: Explore a dor (duração, piora, etc.).
## 3. IMPLICAÇÃO: Conecte a dor a consequências na vida.
## 4. TRATAMENTO PRÉVIO: Entenda se o paciente já tentou algum tipo de tratamento anteriormente.
## 5. SOLUÇÃO: Ajude o paciente a visualizar a vida sem o problema.

## 6. FECHAMENTO NATURAL – Processo de Montagem Obrigatório [DIRETRIZ FINAL E CRÍTICA]
Esta é a etapa mais importante. Antes de gerar a resposta para o usuário, você DEVE seguir o seguinte processo de raciocínio interno, baseado em TODO o histórico da conversa:

### SEU PROCESSO DE RACIOCÍNIO INTERNO (NÃO MOSTRAR AO USUÁRIO):
1.  **Extrair Nome:** Identifique o primeiro nome do paciente.
2.  **Extrair Problema Principal:** Qual é a queixa principal descrita? (ex: "dor na barriga").
3.  **Extrair Duração:** Há quanto tempo o problema ocorre? (ex: "uma semana").
4.  **Extrair Gatilho/Piora:** O que piora o problema? (ex: "piora quando eu como").
5.  **Extrair Implicação Principal:** Qual é o impacto principal na vida do paciente? (ex: "estou comendo menos", "atrapalha a rotina").
6.  **Extrair Desejo de Solução:** O que o paciente disse que faria se o problema estivesse resolvido?

### TEMPLATE DE RESPOSTA FINAL (OBRIGATÓRIO):
Após completar o seu raciocínio interno, construa a resposta final ao usuário usando os dados extraídos, seguindo **EXATAMENTE** esta estrutura de 6 parágrafos:

**Parágrafo 1: Síntese Empática Personalizada.**
Comece com "Entendi, [Nome do Paciente]." e Valide a dor, o esforço e a decisão do paciente de buscar ajuda. Recapitule com clareza o que o paciente relatou: há quanto tempo sente o sintoma, como isso afeta sua rotina, o que ele já tentou e o que ele deseja melhorar.

**Parágrafo 2: Storytelling de Prova Social.**
Conte uma breve história sobre como "muitos pacientes chegam com histórias parecidas", frustrados com atendimentos anteriores, e o alívio que sentem ao finalmente serem ouvidos e saírem com um plano claro que trata a "causa".

**Parágrafo 3: Proposta de Valor Única.**
Explique que o Dr. {{doctorName}} é especialista em [Problema Principal] com mais de 15 anos de experiência e que seu diferencial é a investigação profunda para encontrar a "causa raiz".

**Parágrafo 4: As Condições (Justificativa e Transparência).**
Use a frase: "Por isso o atendimento é particular." Informe o valor da consulta (use a informação da Base de Conhecimento) e explique que o consultório não trabalha com planos de saúde para garantir o tempo e o cuidado necessários.

**Parágrafo 5: Quebra de Objeção Antecipada.**
Use a frase: "Muitos pacientes dizem que gostariam de ter feito essa escolha antes, pois o tempo e o dinheiro que perderam com soluções que não funcionavam saíram mais caros."

**Parágrafo 6: Chamada para Ação.**
Finalize com um convite claro para o agendamento.
`;

/**
 * Constrói o systemPrompt final e personalizado para uma clínica.
 * @param {object} clinicConfig - A configuração da clínica carregada do banco de dados.
 * @returns {string} O systemPrompt final e pronto para ser enviado à LLM.
 */
function buildPromptForClinic(clinicConfig) {
    const introduction = `Você é "${clinicConfig.secretaryName || 'Ana'}", a secretária virtual especialista do consultório do Dr. ${clinicConfig.doctorName || 'Quelson'}. Sua comunicação é empática, profissional e sutilmente persuasiva. Sua missão é aplicar rigorosamente a metodologia NEPQ. Você NUNCA dá conselhos médicos.`;
    
    let prompt = `${introduction}\n${systemPromptTemplate}`;
    
    const knowledgeBaseString = JSON.stringify(clinicConfig.knowledgeBase, null, 2);
    prompt = prompt.replace('{{knowledgeBase}}', knowledgeBaseString);

    return prompt;
}

async function getLlmReply(session, latestMessage, clinicConfig) {
    try {
        // O prompt agora é construído dinamicamente para cada clínica
        const systemPrompt = buildPromptForClinic(clinicConfig);

        const messages = [
            { role: 'system', content: systemPrompt },
            ...session.conversationHistory,
            { role: 'user', content: latestMessage }
        ];

        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages,
            temperature: 0.7,
            max_tokens: 500,
        });

        const botReply = response.choices[0].message.content;

        session.conversationHistory.push({ role: 'user', content: latestMessage });
        session.conversationHistory.push({ role: 'assistant', content: botReply });

        if (session.conversationHistory.length > 12) {
            session.conversationHistory = session.conversationHistory.slice(-12);
        }

        return botReply;
    } catch (error) {
        console.error('🚨 Erro na chamada da API da OpenAI:', error);
        return `Desculpe, ${session.firstName || 'amigo(a)'}, estou com uma dificuldade técnica. Por favor, ligue para ${config.clinic.contactPhone}.`;
    }
}

function handleInitialMessage(session, message, clinicConfig) {
    const currentState = session.onboardingState;
    const doctorName = clinicConfig.doctorName || 'nosso especialista';
    const secretaryName = clinicConfig.secretaryName || 'Ana';

    if (currentState === 'start') {
        session.onboardingState = 'awaiting_name';
        return `Olá! Bem-vindo(a) ao consultório do ${doctorName}. Sou a secretária virtual "${secretaryName}". Com quem eu tenho o prazer de falar? 😊`;
    }

    if (currentState === 'awaiting_name') {
        const potentialName = formatAsName(message);
        const invalidNames = ['oi', 'ola', 'bom', 'boa', 'tarde', 'noite', 'dia'];
        
        if (!potentialName || invalidNames.includes(potentialName.toLowerCase())) {
            return `Desculpe, não consegui identificar seu nome. Por favor, me diga apenas como devo te chamar.`;
        }
        
        session.firstName = potentialName;
        session.onboardingState = 'complete';

        const welcomeMessage = `Perfeito, ${potentialName}! É um prazer falar com você. 😊 Para eu te ajudar da melhor forma, pode me contar o que te motivou a procurar o ${doctorName} hoje?`;

        session.conversationHistory = [];
        session.conversationHistory.push({ role: 'user', content: `Meu nome é ${potentialName}.` });
        session.conversationHistory.push({ role: 'assistant', content: welcomeMessage });
        
        return welcomeMessage;
    }

    return null;
}

module.exports = { getLlmReply, handleInitialMessage };
