import { supabase } from '../supabaseClient.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export const grantWhatsappConsent = async (req, res) => {
  // Assumimos que o middleware de autenticação adiciona o ID do usuário ao objeto req
  const userId = req.user.id; 

  if (!userId) {
    return res.status(401).json({ error: 'User not authenticated' });
  }

  try {
    const { error } = await supabase
      .from('clinics') // <-- AQUI! Alterado de 'users' para 'clinics'
      .update({ whatsapp_consent_given: true })
      .eq('id', userId);

    if (error) {
      throw error;
    }

    res.status(200).json({ message: 'WhatsApp consent granted successfully.' });
  } catch (error) {
    console.error('Error granting WhatsApp consent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
