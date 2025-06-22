/**
 * Módulo de Quebra de Objeções - Modelo M2
 * 
 * Este módulo intercepta objeções clássicas durante o atendimento por WhatsApp
 * e responde com textos de alta conversão.
 * 
 * Caso o paciente levante uma objeção e não haja correspondência exata,
 * a LLM deve analisar semanticamente a intenção e:
 * 1. Usar a resposta mais próxima adaptando a linguagem,
 * 2. Ou criar uma resposta nova com base nos princípios do modelo M2.
 */

const objections = [
  {
    id: 'plano-de-saude',
    keywords: [
      'plano de saúde', 'convênio', 'atende plano', 'médico do meu plano', 'aceita plano', 'tem convênio'
    ],
    resposta: `Entendi perfeitamente. A maioria dos nossos pacientes também veio com essa ideia no início. Inclusive, muitos passaram por consultas via plano antes de decidirem marcar no particular. 

E o que acontece quase sempre é que passaram por atendimentos muito rápidos, com aquela sensação de que o médico nem olhou no rosto... ou saíram com mais dúvidas do que chegaram. Provavelmente você também já passou por algo assim, né?

E às vezes o custo de continuar tentando o mesmo caminho… é maior do que o valor da consulta.

A diferença aqui é que o Dr. realmente tem tempo pra te escutar, investigar a fundo e te acompanhar de perto — o que é muito difícil acontecer dentro da lógica dos planos.

A gente não marca consulta aqui por impulso — quem vem, vem porque quer resolver de verdade. Mas pensa por exemplo: quanto tempo mais você quer conviver com esse problema? Acho que o melhor momento é agora, e eu consigo te ajudar a agendar. Melhor pra você seria de manhã ou de tarde?`
  },
  {
    id: 'ver-com-parceiro',
    keywords: [
      'ver com meu marido', 'ver com minha esposa', 'preciso falar com meu marido', 'ver com meu parceiro', 'ver com minha parceira'
    ],
    resposta: `Claro, super entendo. É natural querer conversar com quem está do nosso lado — ainda mais quando se trata da nossa saúde.

Agora… posso te dizer o que acontece com frequência por aqui? A pessoa adia pra ‘conversar em casa’, mas o problema continua, às vezes até piora, e isso gera mais angústia — tanto pra ela quanto pra quem convive com ela.

E normalmente, quando o parceiro entende que você está buscando ajuda de verdade, ele apoia.

Então posso te fazer uma sugestão prática? A gente garante esse horário pra você agora, sem compromisso. Se depois de conversar acharem que não é o momento, é só me avisar. Assim, você não perde a vaga… e nem a chance de resolver o que está te incomodando.

Então, amanhã às 14:00h?`
  },
  {
    id: 'preco-caro',
    keywords: [
      'caro', 'muito caro', 'tá caro', 'tá meio caro', 'não tenho dinheiro', 'não consigo pagar'
    ],
    resposta: `Você sabia que muitos dos nossos pacientes falavam a mesma coisa no começo… até perceberem que o problema estava custando bem mais do que o valor da consulta?

Gasto com remédio que não resolve, noites mal dormidas, aquele incômodo que nunca passa...

Às vezes, o que parece caro é exatamente o que resolve — e no fim, sai mais barato do que continuar sofrendo.

Agora só você pode decidir: quer continuar como está… ou quer resolver de verdade?

Porque, para resolver, eu consigo um horário pra você amanhã às 14h.`
  },
  {
    id: 'vou-pensar',
    keywords: [
      'vou pensar', 'te aviso depois', 'ver direitinho', 'depois eu vejo', 'vou decidir ainda'
    ],
    resposta: `Claro, sem problema. É normal ficar em dúvida quando se quer resolver algo importante.

Posso só te dizer uma coisa com sinceridade?

Muitos pacientes também quiseram ‘olhar outras opções’ antes… mas depois voltaram dizendo que gostariam de ter marcado logo, porque perderam tempo com atendimentos que não deram resultado.

Se você sente que quer resolver isso de verdade e está buscando alguém que te escute com calma, investigue a fundo e acompanhe até melhorar — é exatamente isso que o Dr. faz aqui.

Quer que eu reserve um horário e, se decidir diferente depois, é só me avisar? Assim você não perde a chance de começar a cuidar disso com mais segurança.

Amanhã às 14h, fica bom pra você?`
  },
  {
    id: 'aguardando-exame',
    keywords: [
      'esperando exame', 'sair o resultado', 'aguardando resultado', 'sair o exame', 'esperar exame'
    ],
    resposta: `Entendo. Mas deixa eu te contar uma coisa que muitos pacientes não sabem:

O exame mostra um pedaço da história — mas quem resolve o problema é o médico, não o papel.

Tem muita coisa que o Dr. já consegue avaliar mesmo antes do resultado. E quanto mais ele entender agora, melhor ele vai interpretar esse exame depois.

Se você quiser já dar esse primeiro passo, eu consigo um horário ainda essa semana. Assim você não perde tempo e já começa a cuidar de verdade.`
  }
];

/**
 * Detecta uma objeção e retorna uma resposta pronta, ou uma sugestão de adaptação
 * Se não encontrar correspondência direta, retorna a mais próxima semanticamente
 * Ou sinaliza à LLM para criar uma nova com base no modelo M2
 */
function detectarObjeção(mensagem) {
  const texto = mensagem.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  // 1. Procura correspondência exata
  for (const obj of objections) {
    if (obj.keywords.some(k => texto.includes(k))) {
      console.log(`💡 Objeção detectada: ${obj.id}`);
      return obj.resposta;
    }
  }

  // 2. Sinaliza à LLM: inferir intenção e adaptar
  return `⚠️ Objeção detectada, mas sem correspondência exata. 

Por favor, analise a intenção da mensagem abaixo e:

1. Use a resposta mais próxima da lista de objeções do modelo M2, adaptando a linguagem.
2. Se necessário, crie uma nova resposta seguindo os princípios do modelo M2:

Mensagem original: """${mensagem}"""`;
}

module.exports = { detectarObjeção };
