const fs = require('fs');
const path = require('path');
const express = require('express');
const bodyParser = require('body-parser');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// إعداد التوكن والدومين
const token = process.env.TELEGRAM_TOKEN;
const renderUrl = process.env.RENDER_URL;

const app = express();
app.use(bodyParser.json());

// إنشاء البوت بدون تحديد بورت
const bot = new TelegramBot(token);
bot.setWebHook(`${renderUrl}/bot${token}`);

// إعداد Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// تحميل القاموس
const DICTIONARY_PATH = path.join(__dirname, 'dictionary.json');
let dictionary = {};

try {
  if (fs.existsSync(DICTIONARY_PATH)) {
    dictionary = JSON.parse(fs.readFileSync(DICTIONARY_PATH));
    console.log(`📚 تم تحميل القاموس (${Object.keys(dictionary).length} كلمة)`);
  } else {
    fs.writeFileSync(DICTIONARY_PATH, JSON.stringify({}, null, 2));
    console.log('📝 تم إنشاء ملف قاموس جديد');
  }
} catch (err) {
  console.error('❌ خطأ في قراءة القاموس:', err);
}

function findPhraseInDictionary(text) {
  const normalizedText = text.trim().toLowerCase();
  const dictKeys = Object.keys(dictionary);
  if (dictionary[normalizedText]) return dictionary[normalizedText];
  for (const phrase of dictKeys) {
    if (normalizedText.includes(phrase)) return dictionary[phrase];
  }
  return null;
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim().toLowerCase();
  if (!text) return;

  const meaning = findPhraseInDictionary(text);
  if (meaning) {
    bot.sendMessage(chatId, `📚 المعنى من القاموس:\n${meaning}`);
    return;
  }

  try {
    const prompt = `اشرح معنى العبارة باللهجة اليمنية العتمية "${text}" بالعربية الفصحى.`;
    const result = await model.generateContent({
      contents: [{ parts: [{ text: prompt }] }]
    });
    const response = result.response.text().trim();
    bot.sendMessage(chatId, `🤖 الذكاء الاصطناعي:\n${response}`);
  } catch (error) {
    console.error("❌ خطأ في استدعاء Gemini:", error);
    bot.sendMessage(chatId, "❌ حدث خطأ أثناء محاولة الفهم. حاول مرة أخرى لاحقًا.");
  }
});

// استقبال Webhook
app.post(`/bot${token}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// صفحة رئيسية للتأكد
app.get('/', (req, res) => res.send('Bot is running via Webhook'));

// تشغيل السيرفر
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook server running on port ${PORT}`);
});
