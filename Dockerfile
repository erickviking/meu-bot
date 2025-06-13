# --- Estágio 1: Base e Instalação de Dependências ---

# Define a imagem base sobre a qual vamos construir. Usamos a mesma que antes.
FROM node:22-alpine

# Define o diretório de trabalho dentro do contêiner.
# A partir daqui, todos os comandos serão executados neste diretório.
WORKDIR /app

# Copia os arquivos que listam as dependências.
# O `*` garante que tanto `package.json` quanto `package-lock.json` sejam copiados.
COPY package*.json ./

# Executa o comando para instalar as dependências listadas no package.json.
# Isso é feito em um passo separado para aproveitar o cache do Docker.
RUN npm install

# --- Estágio 2: Adição do Código e Execução ---

# Agora, copia todo o resto do código do seu projeto para o diretório de trabalho.
COPY . .

# Informa ao Docker que o contêiner escuta na porta 3000 em tempo de execução.
# Isso é mais para documentação e interoperabilidade.
EXPOSE 3000

# O comando que será executado quando o contêiner iniciar.
# Ele inicia o seu bot.
CMD ["node", "bot.js"]