// src/utils/langLLM.js
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Retorna sempre 'pt' ou 'en'
export async function detectLangLLM(text) {
  const prompt = `Detect the user's language. Reply ONLY with one of these two strings:
- pt  (Brazilian Portuguese)
- en  (English)

Text:
"""${text || ''}"""`;

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-5-mini',
      // ⚠️ Não enviar temperature/max_tokens com este modelo no seu SDK
      messages: [{ role: 'user', content: prompt }],
    });

    const raw = res.choices?.[0]?.message?.content?.trim().toLowerCase() || '';
    // Normaliza possíveis variações
    if (raw === 'en' || raw.includes('en')) return 'en';
    // Qualquer coisa diferente, padroniza em 'pt'
    return 'pt';
  } catch (e) {
    console.warn('[detectLangLLM] fallback to pt:', e?.message);
    return 'pt';
  }
}
