require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// إعداد المتغيرات
const token = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ID = parseInt(process.env.ADMIN_ID, 10);
const PORT = parseInt(process.env.PORT, 10) || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!token || !GEMINI_API_KEY || !ADMIN_ID || !WEBHOOK_URL || !WEBHOOK_SECRET) {
  console.error('❌ متغيرات البيئة غير مكتملة!');
  process.exit(1);
}

// تهيئة البوت
const bot = new TelegramBot(token, { polling: false });
const app = express();

// تسجيل الطلبات
app.use(express.json());
app.use((req, res, next) => {
  console.log(`📩 ${req.method} ${req.path}`);
  next();
});

// تحميل القاموس
const DICTIONARY_PATH = path.join(__dirname, 'dictionary.json');
if (!fs.existsSync(DICTIONARY_PATH)) {
  fs.writeFileSync(DICTIONARY_PATH, JSON.stringify({}, null, 2));
}

let dictionary = {};
try {
  dictionary = JSON.parse(fs.readFileSync(DICTIONARY_PATH));
  console.log(`✅ قاموس محمل (${Object.keys(dictionary).length} كلمة)`);
} catch (err) {
  console.error('❌ خطأ في تحميل القاموس:', err);
}

// دالة شرح الكلمات باستخدام Gemini
async function explainWithGemini(text) {
  try {
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      { contents: [{ parts: [{ text }] }] },
      { params: { key: GEMINI_API_KEY } }
    );
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '❌ لم يتم الحصول على رد.';
  } catch (err) {
    console.error('❌ خطأ في Gemini:', err.message);
    return '⚠️ حدث خطأ أثناء التواصل مع خدمة Gemini.';
  }
}

// أمر إضافة كلمة (للمشرف فقط)
bot.onText(/^\/addword (.+?):(.+)$/i, (msg, match) => {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

  if (userId !== ADMIN_ID) {
    return bot.sendMessage(chatId, '❌ هذا الأمر مخصص للمشرف فقط.');
  }

  const [_, word, meaning] = match;
  dictionary[word.trim()] = meaning.trim();
  fs.writeFileSync(DICTIONARY_PATH, JSON.stringify(dictionary, null, 2));
  bot.sendMessage(chatId, `✅ تمت إضافة الكلمة "${word.trim()}" بنجاح.`);
});

// أمر عرض الكلمات
bot.onText(/^\/words$/, (msg) => {
  const chatId = msg.chat.id;
  const words = Object.keys(dictionary);
  if (words.length === 0) {
    bot.sendMessage(chatId, '📭 لا توجد كلمات في القاموس حالياً.');
  } else {
    bot.sendMessage(chatId, `📚 الكلمات المخزنة:\n\n${words.join(', ')}`);
  }
});

// أمر المساعدة
bot.onText(/^\/(start|help)$/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, `
مرحباً! هذا البوت يشرح مفردات لهجة "عتمة" اليمنية.

الأوامر المتاحة:
/help - عرض هذه الرسالة
/words - عرض الكلمات المخزنة

كمستخدم، أرسل أي كلمة وسنحاول شرحها.
  `.trim());
});

// استقبال الرسائل العامة
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  // تجاهل الأوامر
  if (!text || text.startsWith('/')) return;

  if (dictionary[text]) {
    return bot.sendMessage(chatId, `📖 "${text}" تعني: ${dictionary[text]}`);
  }

  const prompt = `اشرح كلمة باللهجة اليمنية "عتمة": ${text}`;
  const response = await explainWithGemini(prompt);
  bot.sendMessage(chatId, response);
});

// نقطة نهاية لعرض الحالة
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    dictionaryCount: Object.keys(dictionary).length,
  });
});

// نقطة نهاية للويب هوك
app.post('/webhook', (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    console.warn('⛔ محاولة وصول غير مصرح بها.');
    return res.sendStatus(403);
  }

  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error('💥 خطأ أثناء معالجة التحديث:', err);
    res.sendStatus(500);
  }
});

// تشغيل السيرفر وتعيين الويب هوك
const startServer = () => {
  const server = app.listen(PORT, async () => {
    console.log(`🚀 الخادم يعمل على البورت ${PORT}`);
    try {
      await bot.setWebHook(`${WEBHOOK_URL}/webhook`, {
        secret_token: WEBHOOK_SECRET,
        drop_pending_updates: true
      });
      console.log('✅ تم تفعيل الويب هوك');
    } catch (err) {
      console.error('❌ فشل تفعيل الويب هوك:', err.message);
    }
  });

  server.on('error', (err) => {
    console.error('❌ خطأ في الخادم:', err);
    process.exit(1);
  });
};

startServer();

// التقاط الأخطاء غير المعالجة
process.on('unhandledRejection', (err) => {
  console.error('⚠️ خطأ غير معالج:', err);
});
