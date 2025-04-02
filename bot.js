require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const app = express();
const PORT = process.env.PORT || 3000;

// تهيئة البوت
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN);
app.use(express.json());

// تعريف Webhook مع رابطك الخاص
const webhookUrl = 'https://my-telegram-bot-8zl0.onrender.com/webhook';
bot.setWebHook(webhookUrl);

// معالجة الرسائل الواردة
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// تشغيل الخادم
app.listen(PORT, () => {
  console.log(`✅ البوت يعمل على المنفذ ${PORT}`);
  console.log(`🌐 Webhook URL: ${webhookUrl}`);
});

// قاموس الكلمات
const DICTIONARY = {
  "فندقة": {
    variations: ["الفندقة", "فندقي", "فندق", "فندقه", "فندكة"],
    answer: "لهجة منتشرة في مديرية عتمة"
  },
  "ساهف": {
    variations: ["ساهفة", "سحفة", "سحيف", "سحف"],
    answer: "شخص سيء الخلق"
  },
  "شلالة": {
    variations: ["شله", "شلا", "شل", "شلاه"],
    answer: "النقود أو المال"
  },
  "أسايعه": {
    variations: ["اسايعه", "أسايعة", "اسايعة", "اسيع", "أسيع"],
    answer: "نساء أو إناث"
  },
  "ادمخ": {
    variations: ["أدمخ", "دمخ", "أدموخ", "ادموخ"],
    answer: "معناها اذهب"
  },
  "معكال": {
    variations: ["معكالة", "معكالو", "معكالي"],
    answer: "كلمة خادشة للحياء"
  },
  "مجبر حمس": {
    variations: ["مجبرحمس", "مجبر حمسي", "حمس مجبر", "مجبر حمسو"],
    answer: "رجل مميز أو رائع"
  }
};

// معالجة أمر /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    "🏮 <b>مرحباً ببوت كاشف الفندقة!</b>\n" +
    "✍️ اكتب أي كلمة من لهجة عتمة لمعرفة معناها\n\n" +
    "🔍 أمثلة: <code>فندقة</code> - <code>شلالة</code> - <code>مجبر حمس</code>",
    { parse_mode: "HTML" });
});

// معالجة الرسائل النصية
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  
  if (!text || text.startsWith('/')) return;
  
  const answer = findAnswer(text) || "⚠️ لم يتم العثور على الكلمة في القاموس";
  bot.sendMessage(chatId, answer);
});

// دالة البحث في القاموس
function findAnswer(query) {
  const cleanQuery = query.toLowerCase()
    .replace(/[أإآءئؤ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .trim();

  for (const [word, data] of Object.entries(DICTIONARY)) {
    const allForms = [word.toLowerCase(), ...data.variations.map(v => v.toLowerCase())];
    const normalizedForms = allForms.map(form => 
      form.replace(/[أإآءئؤ]/g, 'ا')
          .replace(/[ة]/g, 'ه')
          .replace(/[ىي]/g, 'ي')
    );
    
    if (normalizedForms.includes(cleanQuery)) {
      return data.answer;
    }
  }
  return null;
}
