require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const NodeCache = require('node-cache');
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {polling: true});
const cache = new NodeCache({ stdTTL: 30 }); // بديل عن CacheService

// قاموس الكلمات (محدث بدون أخطاء)
const DICTIONARY = {
  "فندقة": {
    variations: ["الفندقة", "فندقي", "فندق"],
    answer: "لهجة منتشرة في مديرية عتمة"
  },
  "ساهف": {
    variations: ["ساهفة", "سحفة", "سحيف", "سحف"],
    answer: "شخص سيء الخلق"
  },
  // ... أضف بقية الكلمات بنفس الهيكل ...
  "مجبر حمس": {
    variations: ["مجبرحمس", "مجبر حمسي", "حمس مجبر", "مجبر حمسو"], // تصحيح الخطأ
    answer: "رجل مميز أو رائع"
  },
  "مجابرة": {
    variations: ["مجابر", "مجابرو", "مجابري", "مجابرات"], // تصحيح الخطأ
    answer: "رجال (جمع)"
  }
};

// معالجة أمر /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    "🏮 <b>مرحباً ببوت كاشف الفندقة!</b>\n" +
    "✍️ اكتب أي كلمة من لهجة عتمة لمعرفة معناها\n\n" +
    "🔍 أمثلة: <code>شنحامة</code> - <code>قطنية</code> - <code>مجبر حمس</code>",
    { parse_mode: "HTML" });
});

// معالجة الرسائل
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();
  const userId = msg.from.id;

  if (!text || text.startsWith('/')) return;

  // منع التكرار (30 ثانية)
  const cacheKey = `last_${userId}_${text.toLowerCase()}`;
  if (cache.get(cacheKey)) return;
  cache.set(cacheKey, true, 30);

  // البحث عن الإجابة
  const answer = findAnswer(text) || 
    "⚠️ لم يتم العثور على الكلمة في القاموس\n" +
    "يمكنك اقتراح إضافتها عبر مراسلة المطور";

  bot.sendMessage(chatId, answer);
});

function findAnswer(query) {
  const cleanQuery = query.toLowerCase()
    .replace(/[أإآء]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي');
  
  for (const [word, data] of Object.entries(DICTIONARY)) {
    const allForms = [word.toLowerCase(), ...data.variations.map(v => v.toLowerCase())];
    const normalizedForms = allForms.map(form => 
      form.replace(/[أإآء]/g, 'ا')
          .replace(/[ة]/g, 'ه')
          .replace(/[ى]/g, 'ي')
    );
    
    if (normalizedForms.includes(cleanQuery)) {
      return data.answer;
    }
  }
  return null;
}
