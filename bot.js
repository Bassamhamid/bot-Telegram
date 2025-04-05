// telegram-dictionary-bot require('dotenv').config(); const express = require('express'); const TelegramBot = require('node-telegram-bot-api'); const axios = require('axios'); const fs = require('fs'); const path = require('path');

const { TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, WEBHOOK_URL, WEBHOOK_SECRET } = process.env;

const DICTIONARY_PATH = path.join(__dirname, 'dictionary.json'); let dictionary = {}; try { if (fs.existsSync(DICTIONARY_PATH)) { dictionary = JSON.parse(fs.readFileSync(DICTIONARY_PATH)); console.log(تم تحميل القاموس (${Object.keys(dictionary).length} كلمة)); } else { fs.writeFileSync(DICTIONARY_PATH, JSON.stringify({}, null, 2)); console.log('تم إنشاء ملف قاموس جديد'); } } catch (err) { console.error('خطأ في قراءة القاموس:', err); }

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { webHook: { port: process.env.PORT || 3000 } }); bot.setWebHook(${WEBHOOK_URL}/webhook, { secret_token: WEBHOOK_SECRET }); const app = express(); app.use(express.json());

function findPhraseInDictionary(message) { const lowerMsg = message.toLowerCase(); for (const [key, meaning] of Object.entries(dictionary)) { if (lowerMsg.includes(key.toLowerCase())) { return { word: key, meaning }; } } return null; }

async function explainWithGemini(text) { const url = 'https://generativelanguage.googleapis.com/v1/models/gemini-1.5-pro-latest:generateContent'; const prompt = اشرح الكلمة أو العبارة التالية باللهجة اليمنية: ${text}; try { const response = await axios.post(${url}?key=${GEMINI_API_KEY}, { contents: [{ parts: [{ text: prompt }] }] }); const reply = response.data.candidates?.[0]?.content?.parts?.[0]?.text; return reply || 'لم أستطع شرح هذه الكلمة حالياً.'; } catch (error) { console.error('خطأ في استدعاء Gemini:', error); return 'حدث خطأ أثناء شرح الكلمة.'; } }

bot.onText(//start/, (msg) => { bot.sendMessage(msg.chat.id, 'مرحباً! أرسل لي أي كلمة أو عبارة باللهجة العتمية وسأشرحها لك.'); });

bot.onText(//words/, (msg) => { const words = Object.keys(dictionary); if (words.length === 0) { bot.sendMessage(msg.chat.id, 'القاموس فارغ حالياً.'); } else { bot.sendMessage(msg.chat.id, الكلمات المتوفرة: ${words.join(', ')}); } });

bot.on('message', async (msg) => { const chatId = msg.chat.id; const text = msg.text?.trim(); if (!text || text.startsWith('/')) return;

const found = findPhraseInDictionary(text); if (found) { bot.sendMessage(chatId, شرح "${found.word}": ${found.meaning}); } else { const explanation = await explainWithGemini(text); bot.sendMessage(chatId, explanation); } });

app.post('/webhook', (req, res) => { if (req.headers['x-telegram-bot-api-secret-token'] === WEBHOOK_SECRET) { bot.processUpdate(req.body); res.sendStatus(200); } else { res.sendStatus(403); } });

app.get('/', (_, res) => res.send('البوت يعمل حالياً'));

process.on('unhandledRejection', (err) => { console.error('Unhandled rejection:', err); });

