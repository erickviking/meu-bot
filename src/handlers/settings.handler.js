const supabase = require('../services/supabase.client');

/**
 * Atualiza o status de consentimento do WhatsApp para uma clínica.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const grantWhatsappConsent = async (req, res) => {
  // O middleware de autenticação (authMiddleware) garante que 'req.user.id' existe.
  const clinicId = req.user.id;

  if (!clinicId) {
    // Esta verificação é uma segurança extra, mas o middleware já deve ter barrado.
    return res.status(401).json({ error: 'Usuário não autenticado.' });
  }

  try {
    const { error } = await supabase
      .from('clinics') // Alvo na tabela correta
      .update({ whatsapp_consent_given: true })
      .eq('id', clinicId);

    if (error) {
      console.error('❌ Erro do Supabase ao conceder consentimento:', error);
      throw error;
    }

    console.log(`[API] Consentimento para WhatsApp concedido com sucesso para a clínica ID: ${clinicId}`);
    res.status(200).json({ message: 'Consentimento para WhatsApp concedido com sucesso.' });

  } catch (error) {
    res.status(500).json({ error: 'Erro interno do servidor ao conceder consentimento.' });
  }
};

module.exports = {
    grantWhatsappConsent,
};
