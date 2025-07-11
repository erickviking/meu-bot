const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const config = require('./config');
const allRoutes = require('./routes');
const cors = require('cors');

const app = express();

// O middleware do CORS já está corretamente configurado.
app.use(cors());


// --- INÍCIO DA MODIFICAÇÃO: Rota de Teste de Saúde ---
// Adicionamos esta rota simples para verificar se o servidor Express está respondendo.
// Ela deve ser acessada via GET em https://seu-backend-url/health
app.get('/health', (req, res) => {
  console.log('✅ Rota de teste /health foi acessada com sucesso!');
  res.status(200).json({ status: 'ok', message: 'Servidor está no ar.' });
});
// --- FIM DA MODIFICAÇÃO ---


// Middleware para verificar a assinatura da Meta.
const verifyRequestSignature = (req, res, buf) => {
    if (req.originalUrl.includes('/webhook')) {
        const signature = req.headers['x-hub-signature-256'];

        if (!signature) {
            console.warn('⚠️ Assinatura de segurança (x-hub-signature-256) ausente.');
            return;
        }

        const signatureHash = signature.split('=')[1];
        const expectedHash = crypto
            .createHmac('sha256', config.whatsapp.appSecret)
            .update(buf)
            .digest('hex');

        if (signatureHash !== expectedHash) {
            throw new Error('Assinatura do webhook inválida. A requisição pode ser fraudulenta.');
        }
    }
};

// Usamos o bodyParser com a função de verificação.
try {
    app.use(bodyParser.json({ verify: verifyRequestSignature }));
} catch (error) {
    console.error('❌ Falha ao aplicar middleware de segurança:', error);
    process.exit(1);
}

// Rota principal da aplicação que usa o router do index.js
app.use('/', allRoutes);

module.exports = app;
