const supabase = require('../services/supabase.client');

const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
    }

    const token = authHeader.split(' ')[1];

    try {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            return res.status(401).json({ error: 'Token inválido ou expirado.' });
        }

        // Adiciona o usuário autenticado ao objeto de requisição
        req.user = user;
        next(); // Continua para a próxima função (o handler da rota)
    } catch (e) {
        return res.status(500).json({ error: 'Erro interno ao validar autenticação.' });
    }
};

module.exports = { authMiddleware };
