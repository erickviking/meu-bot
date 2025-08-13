// src/utils/i18n.js
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Redis é opcional. Se você já tem, exporte seu cliente aqui:
// import { redis } from '../config/redis';
let memoryCache = new Map(); // fallback quando não há Redis

async function getCache(key) {
  // if (redis) return await redis.get(key);
  return memoryCache.get(key) || null;
}

async function setCache(key, value, ttlSeconds = 2592000) { // 30 dias
  // if (redis) return await redis.set(key, value, { EX: ttlSeconds });
  memoryCache.set(key, value);
}

export async function localize(baseTextPt, targetLang) {
  if (!baseTextPt) return '';
  if (targetLang === 'pt') return baseTextPt;

  const key = `i18n:${targetLang}:${Buffer.from(baseTextPt).toString('base64')}`;
  const cached = await getCache(key);
  if (cached) return cached;

  // Tradução para EN
  const messages = [
    { role: 'system', content: 'Translate to clear, natural English. Keep persuasive tone and placeholders. Do not add explanations.' },
    { role: 'user', content: baseTextPt }
  ];

  try {
    const res = await client.chat.completions.create({
      model: 'gpt-5-mini',
      temperature: 0.1,
      messages,
    });
    const translated = res.choices?.[0]?.message?.content?.trim() || baseTextPt;
    await setCache(key, translated);
    return translated;
  } catch (e) {
    console.warn('[i18n.localize] translation failed, fallback to PT:', e?.message);
    return baseTextPt; // fallback seguro
  }
}
