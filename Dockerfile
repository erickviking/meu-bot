# Estágio 1: Builder - Instala dependências e prepara o código
FROM node:24-slim AS builder

WORKDIR /app

# Copia os manifestos de pacotes para otimizar o cache do Docker
COPY package.json package-lock.json ./

# Instala apenas as dependências de produção de forma limpa
RUN npm install --omit=dev --clean

# Copia o restante do código-fonte
COPY . .


# Estágio 2: Production - A imagem final, otimizada e segura
FROM node:24-slim

WORKDIR /app

# Instala 'curl', necessário para o HEALTHCHECK, e limpa o cache.
USER root
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copia os artefatos prontos do estágio 'builder'
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app ./

# Define e expõe a porta da aplicação
ARG PORT=3000
ENV PORT=${PORT}
EXPOSE ${PORT}

# Verificação de Saúde: Garante que a aplicação está realmente funcional.
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:${PORT}/health || exit 1

# Muda para um usuário não-root por segurança antes de iniciar a aplicação.
USER node

# Comando final para iniciar a aplicação
CMD ["node", "server.js"]
