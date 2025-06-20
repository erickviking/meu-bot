# Estágio 1: Builder - Onde as dependências são instaladas
# Usamos uma imagem completa do Node para ter acesso ao npm e outras ferramentas de build.
FROM node:20-slim AS builder

# Define o diretório de trabalho dentro do container
WORKDIR /app

# Copia os arquivos de definição de pacotes primeiro para aproveitar o cache do Docker.
# O Docker só reinstalará as dependências se estes arquivos mudarem.
COPY package.json package-lock.json ./

# Instala APENAS as dependências de produção. Ignora devDependencies como o nodemon.
RUN npm install --omit=dev --clean

# Copia o resto do código-fonte da aplicação.
COPY . .


# Estágio 2: Production - A imagem final que será executada
# Usamos uma imagem "slim" que é menor e mais segura, pois não contém ferramentas de build.
FROM node:20-slim

# Define o diretório de trabalho (deve ser o mesmo do estágio de build)
WORKDIR /app

# Define um argumento para a porta, com um valor padrão.
ARG PORT=3000
# Expõe a porta para o ambiente externo.
EXPOSE ${PORT}
# Define a variável de ambiente PORT dentro do container.
ENV PORT=${PORT}

# Copia os node_modules e o código-fonte do estágio 'builder'.
# Isso evita ter que reinstalar tudo e mantém a imagem final limpa.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app ./

# Por segurança, roda a aplicação com um usuário não-root.
USER node

# Comando final para iniciar a aplicação.
# Exatamente como você especificou.
CMD ["node", "server.js"]
