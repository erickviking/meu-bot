/**
 * Módulo de Quebra de Objeções - Modelo M2
 * * Este módulo intercepta objeções clássicas durante o atendimento por WhatsApp
 * e responde com textos de alta conversão pré-definidos.
 */

const objections = [
  {
    id: 'plano-de-saude',
    keywords: [
      'plano de saude', 'convenio', 'atende plano', 'medico do meu plano', 'aceita plano', 'tem convenio', 'bradesco', 'sulamerica', 'unimed'
    ],
    // A resposta agora é uma função que aceita o nome para personalização.
    resposta: (name) => `Entendi perfeitamente, ${name}. A maioria dos nossos pacientes também veio com essa ideia no início. Inclusive, muitos passaram por consultas via plano antes de decidirem marcar no particular.\n\nE o que acontece quase sempre é que passaram por atendimentos muito rápidos, com aquela sensação de que o médico nem olhou no rosto... ou saíram com mais dúvidas do que chegaram. Provavelmente você também já passou por algo assim, né?\n\nA diferença aqui é que o Dr. Quelson realmente tem tempo pra te escutar e investigar a fundo. Quem vem, vem porque quer resolver de verdade. Mas pensa por exemplo: quanto tempo mais você quer conviver com esse problema? Acho que o melhor momento é agora, e eu consigo te ajudar a agendar. Melhor pra você seria de manhã ou de tarde?`
  },
  {
    id: 'ver-com-parceiro',
    keywords: [
      'ver com meu marido', 'ver com minha esposa', 'falar com meu marido', 'ver com meu parceiro', 'falar com minha parceira'
    ],
    resposta: (name) => `Claro, ${name}, super entendo. É natural querer conversar com quem está do nosso lado — ainda mais quando se trata da nossa saúde.\n\nAgora… posso te dizer o que acontece com frequência por aqui? A pessoa adia pra ‘conversar em casa’, mas o problema continua, às vezes até piora, e isso gera mais angústia — tanto pra ela quanto pra quem convive com ela.\n\nPosso te fazer uma sugestão prática? A gente garante esse horário pra você agora, sem compromisso. Se depois de conversar acharem que não é o momento, é só me avisar. Assim, você não perde a vaga. Que tal amanhã às 14:00h?`
  },
  {
    id: 'preco-caro',
    keywords: [
      'caro', 'muito caro', 'ta caro', 'meio caro', 'nao tenho dinheiro', 'nao consigo pagar'
    ],
    resposta: (name) => `Você sabia, ${name}, que muitos dos nossos pacientes falavam a mesma coisa no começo… até perceberem que o problema estava custando bem mais do que o valor da consulta?\n\nGasto com remédio que não resolve, noites mal dormidas, aquele incômodo que nunca passa...\n\nÀs vezes, o que parece caro é exatamente o que resolve — e no fim, sai mais barato do que continuar sofrendo.\n\nAgora só você pode decidir: quer continuar como está… ou quer resolver de verdade? Porque, para resolver, eu consigo um horário pra você amanhã às 14h.`
  },
  {
    id: 'vou-pensar',
    keywords: [
      'vou pensar', 'te aviso depois', 'ver direitinho', 'depois eu vejo', 'decidir ainda'
    ],
    resposta: (name) => `Claro, ${name}, sem problema. É normal ficar em dúvida quando se quer resolver algo importante.\n\nPosso só te dizer uma coisa com sinceridade? Muitos pacientes também quiseram ‘olhar outras opções’ antes… mas depois voltaram dizendo que gostariam de ter marcado logo, porque perderam tempo com atendimentos que não deram resultado.\n\nSe você sente que quer resolver isso de verdade e está buscando alguém que te escute com calma e investigue a fundo — é exatamente isso que o Dr. Quelson faz aqui. Quer que eu reserve um horário e, se decidir diferente depois, é só me avisar? Amanhã às 14h, fica bom para você?`
  },
  {
    id: 'aguardando-exame',
    keywords: [
      'esperando exame', 'sair o resultado', 'aguardando resultado', 'sair o exame', 'esperar exame'
    ],
    resposta: (name) => `Entendo, ${name}. Mas deixa eu te contar uma coisa que muitos pacientes não sabem: o exame mostra um pedaço da história — mas quem resolve o problema é o médico, não o papel.\n\nTem muita coisa que o Dr. Quelson já consegue avaliar mesmo antes do resultado. E quanto mais ele entender agora, melhor ele vai interpretar esse exame depois. Se você quiser já dar esse primeiro passo, eu consigo um horário ainda essa semana.`
  }
];

/**
 * Detecta se a mensagem do usuário corresponde a uma objeção conhecida.
 * @param {string} mensagem - A mensagem do usuário.
 * @param {string} nomeDoPaciente - O nome do paciente para personalizar a resposta.
 * @returns {string|null} A resposta pré-definida para a objeção ou null se nenhuma for encontrada.
 */
function detetarObjeção(mensagem, nomeDoPaciente) {
  const texto = mensagem.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const nome = nomeDoPaciente || 'amigo(a)'; // Garante um fallback para o nome
  
  for (const obj of objections) {
    if (obj.keywords.some(k => texto.includes(k))) {
      console.log(`💡 Objeção detectada por palavra-chave: ${obj.id}`);
      // Retorna a resposta personalizada com o nome do paciente
      return obj.resposta(nome);
    }
  }
  return null; // Nenhuma objeção detectada
}

module.exports = { detetarObjeção };
