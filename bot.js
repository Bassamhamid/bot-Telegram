// Telegram bot for Yemeni dialect explanation using Gemini API require('dotenv').config(); const express = require('express'); const TelegramBot = require('node-telegram-bot-api'); const axios = require('axios'); const fs = require('fs'); const path = require('path');

// Load and validate environment variables const { TELEGRAM_BOT_TOKEN, GEMINI_API_KEY, WEBHOOK_URL, WEBHOOK_SECRET } = process.env;

if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY || !WEBHOOK_URL || !WEBHOOK_SECRET) { console.error('❌ أحد المتغيرات البيئية مفقود.'); process.exit(1); }

const bot = new TelegramBot(TELEGRAM_BOT_TOKEN, { polling: false }); const app = express();

app.use(express.json());

// Load dictionary const DICTIONARY_PATH = path.join(__dirname, 'dictionary.json'); let dictionary = {};

try { if (fs.existsSync(DICTIONARY_PATH)) { dictionary = JSON.parse(fs.readFileSync(DICTIONARY_PATH)); console.log(📚 تم تحميل القاموس (${Object.keys(dictionary).length} كلمة)); } else { fs.writeFileSync(DICTIONARY_PATH, JSON.stringify({}, null, 2)); console.log('📝 تم إنشاء ملف قاموس جديد'); } } catch (err) { console.error('❌ خطأ في قراءة القاموس:', err); }

// Use Gemini to explain a word async function explainWithGemini(text, knownMeaning) { const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent';

const prompt = knownMeaning ? اشرح معنى العبارة أو الكلمة التالية في لهجة عتمة اليمنية: "${text}". حسب القاموس، معناها: "${knownMeaning}". استخدم هذه المعلومة إن كانت دقيقة. : اشرح معنى العبارة أو الكلمة التالية في لهجة عتمة اليمنية: "${text}". إذا لم تكن معروفة، قل أنها غير معروفة.;

try { const response = await axios.post( API_URL, { contents: [{ parts: [{ text: prompt }] }] }, { params: { key: GEMINI_API_KEY }, headers: { 'Content-Type': 'application/json' }, timeout: 10000 } );

return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '❌ لم أتمكن من العثور على شرح مناسب';

} catch (error) {
