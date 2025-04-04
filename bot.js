require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// تهيئة التطبيق
const app = express();
app.use(express.json());

// مسار ملف القاموس
const DICTIONARY_PATH = path.join(__dirname, 'dictionary.json');

// إنشاء ملف القاموس إذا لم يكن موجوداً
if (!fs.existsSync(DICTIONARY_PATH)) {
  fs.writeFileSync(DICTIONARY_PATH, JSON.stringify({}, null, 2), 'utf-8');
}

// تحميل المتغيرات البيئية
const token = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ID = process.env.ADMIN_ID;
const PORT = process.env.PORT || 3001; // تغيير البورت الافتراضي
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// التحقق من المتغيرات البيئية
if (!token || !GEMINI_API_KEY || !ADMIN_ID || !WEBHOOK_URL || !WEBHOOK_SECRET) {
  console.error('❌ يلزم تعيين جميع المتغيرات البيئية!');
  process.exit(1);
}

// إنشاء البوت
const bot = new TelegramBot(token, {
  polling: false // تعطيل البولينج لأننا نستخدم ويب هوك
});

// تحميل القاموس
let dictionary = {};
try {
  dictionary = JSON.parse(fs.readFileSync(DICTIONARY_PATH, 'utf-8'));
} catch (err) {
  console.error('❌ خطأ في قراءة القاموس:', err);
}

// ========== [أمر /addword] ========== //
bot.onText(/^\/addword (.+?):(.+)$/, async (msg, match) => {
  if (msg.from.id.toString() !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, '⛔ للمسؤول فقط!');
  }

  const word = match[1].trim();
  const explanation = match[2].trim();

  try {
    if (dictionary[word]) {
      return bot.sendMessage(msg.chat.id, `⚠️ الكلمة "${word}" موجودة!`);
    }

    dictionary[word] = explanation;
    fs.writeFileSync(DICTIONARY_PATH, JSON.stringify(dictionary, null, 2), 'utf-8');
    await bot.sendMessage(msg.chat.id, `✅ تمت الإضافة:\n${word}: ${explanation}`);
  } catch (error) {
    console.error('خطأ في الإضافة:', error);
    await bot.sendMessage(msg.chat.id, '❌ حدث خطأ!');
  }
});

// ========== [الذكاء الاصطناعي] ========== //
async function explainWithGemini(input) {
  try {
    if (dictionary[input]) {
      return `📖 شرح "${input}":\n${dictionary[input]}`;
    }

    const isDialect = input.includes('عتمة') || input.includes('لهجة');
    const prompt = isDialect ? 
      `اشرح "${input}" من لهجة عتمة اليمنية` : 
      `أجب عن السؤال التالي: "${input}"`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      { contents: [{ parts: [{ text: prompt }] }] },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'لا يوجد شرح';
  } catch (error) {
    console.error('خطأ في Gemini:', error);
    return 'حدث خطأ في جلب الإجابة';
  }
}

// ========== [معالجة الرسائل] ========== //
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;

  try {
    const loadingMsg = await bot.sendMessage(msg.chat.id, '🔍 جاري البحث...');
    const explanation = await explainWithGemini(msg.text.trim());
    await bot.editMessageText(explanation, {
      chat_id: msg.chat.id,
      message_id: loadingMsg.message_id
    });
  } catch (error) {
    console.error('خطأ في المعالجة:', error);
    await bot.sendMessage(msg.chat.id, '⚠️ حدث خطأ، حاول لاحقاً');
  }
});

// ========== [إعدادات الخادم] ========== //
const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`🚀 يعمل على البورت ${port}`);
    
    // تفعيل الويب هوك بعد نجاح تشغيل الخادم
    bot.setWebHook(`${WEBHOOK_URL}/webhook`, {
      secret_token: WEBHOOK_SECRET,
      allowed_updates: ['message']
    }).then(() => console.log('✅ تم تفعيل الويب هوك'))
    .catch(err => console.error('❌ فشل تفعيل الويب هوك:', err));
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`⚠️ البورت ${port} مشغول، جرب البورت ${parseInt(port) + 1}`);
      startServer(parseInt(port) + 1);
    } else {
      console.error('❌ خطأ في الخادم:', err);
      process.exit(1);
    }
  });
};

app.post('/webhook', (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.json({ status: 'running', version: '2.0.3' });
});

// بدء الخادم
startServer(PORT);

// معالجة الأخطاء غير الملتقطة
process.on('unhandledRejection', (err) => {
  console.error('⚠️ خطأ غير معالج:', err);
});
