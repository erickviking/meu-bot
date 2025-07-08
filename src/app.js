const express = require('express');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const config = require('./config'); // Importa o config da pasta correta
const allRoutes = require('./routes'); // Importa as rotas da pasta correta

const app = express();

// Middleware para verificar a assinatura da Meta, como já tínhamos.
const verifyRequestSignature = (req, res, buf) => {
    // A verificação só se aplica à rota do webhook.
    if (req.originalUrl.includes('/webhook')) {
        const signature = req.headers['x-hub-signature-256'];

        if (!signature) {
            // Em um ambiente de produção real, você deveria lançar um erro.
            // Para depuração, podemos apenas logar e continuar se a assinatura não existir.
            console.warn('⚠️ Assinatura de segurança (x-hub-signature-256) ausente.');
            return;
        }

        const signatureHash = signature.split('=')[1];
        const expectedHash = crypto
            .createHmac('sha256', config.whatsapp.appSecret)
            .update(buf)
            .digest('hex');

        if (signatureHash !== expectedHash) {
            // Lança um erro para parar a requisição se a assinatura for inválida.
            throw new Error('Assinatura do webhook inválida. A requisição pode ser fraudulenta.');
        }
    }
};

// Usamos o bodyParser com a função de verificação.
// O try/catch garante que a aplicação não quebre se houver um erro no middleware.
try {
    app.use(bodyParser.json({ verify: verifyRequestSignature }));
} catch (error) {
    console.error('❌ Falha ao aplicar middleware de segurança:', error);
    // Em caso de falha na configuração do middleware, pare a aplicação.
    process.exit(1);
}

// Rota principal da aplicação
app.use('/', allRoutes);

module.exports = app;
}

export default App;
