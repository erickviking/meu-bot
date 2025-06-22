# Estágio 1: Builder - Instala dependências e prepara o código
FROM node:20-slim AS builder

# Define o diretório de trabalho
WORKDIR /app

# Copia package.json e package-lock.json para aproveitar o cache de camadas do Docker
COPY package.json package-lock.json ./

# Instala apenas as dependências de produção, de forma limpa
RUN npm install --omit=dev --clean

# Copia o restante do código-fonte para o estágio de build
COPY . .


# Estágio 2: Production - A imagem final, otimizada e segura
FROM node:20-slim

# Define o diretório de trabalho
WORKDIR /app

# Instala o 'curl', ferramenta necessária para o HEALTHCHECK.
# Executamos como root e depois limpamos o cache para manter a imagem pequena.
USER root
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copia os node_modules e o código-fonte já prontos do estágio 'builder'
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app ./

# Define a porta da aplicação, permitindo que seja sobrescrita em tempo de build
ARG PORT=3000
ENV PORT=${PORT}

# Expõe a porta para o ambiente externo (ex: Render)
EXPOSE ${PORT}

# Verificação de Saúde: Diz ao Docker como testar se a aplicação está realmente funcional.
# Ele tentará acessar a rota /health a cada 30 segundos.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Muda para o usuário 'node', que não é root, por segurança.
# Esta é a última etapa antes de rodar a aplicação.
USER node

# Comando final para iniciar a aplicação
CMD ["node", "server.js"]
