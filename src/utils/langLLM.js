// src/utils/langLLM.js
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Retorna sempre 'pt' ou 'en'
export async function detectLangLLM(text) {
  const prompt = `Detect the user's language. Reply ONLY with "pt" for Brazilian Portuguese or "en" for English.
Text: """${text || ''}"""`;
  try {
    const res = await client.chat.completions.create({
      model: 'gpt-5-mini',
      temperature: 0,
      max_tokens: 2,
      messages: [{ role: 'user', content: prompt }],
    });
    const out = res.choices?.[0]?.message?.content?.trim().toLowerCase();
    return out === 'en' ? 'en' : 'pt';
  } catch (e) {
    console.warn('[detectLangLLM] fallback to pt:', e?.message);
    return 'pt';
  }
}
