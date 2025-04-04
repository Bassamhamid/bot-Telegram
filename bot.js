require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// تهيئة Express
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
const PORT = process.env.PORT || 10000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// التحقق من المتغيرات البيئية المطلوبة
if (!token || !GEMINI_API_KEY || !ADMIN_ID || !WEBHOOK_URL || !WEBHOOK_SECRET) {
  console.error('❌ يلزم تعيين جميع المتغيرات البيئية المطلوبة!');
  process.exit(1);
}

// إنشاء البوت
const bot = new TelegramBot(token, {
  webHook: { port: PORT },
  onlyFirstMatch: true
});

// تحميل القاموس
let dictionary = {};
try {
  dictionary = JSON.parse(fs.readFileSync(DICTIONARY_PATH, 'utf-8'));
} catch (err) {
  console.error('❌ خطأ في قراءة ملف القاموس:', err.message);
}

// ========== [أمر /addword للمسؤول فقط] ========== //
bot.onText(/^\/addword (.+?):(.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  
  // تحقق من صلاحيات المسؤول
  if (msg.from.id.toString() !== ADMIN_ID) {
    return bot.sendMessage(chatId, '⛔ هذا الأمر متاح للمسؤول فقط!');
  }

  const word = match[1].trim();
  const explanation = match[2].trim();

  try {
    if (dictionary[word]) {
      return bot.sendMessage(chatId, 
        `⚠️ الكلمة "${word}" موجودة بالفعل!`
      );
    }

    dictionary[word] = explanation;
    fs.writeFileSync(DICTIONARY_PATH, JSON.stringify(dictionary, null, 2), 'utf-8');
    
    await bot.sendMessage(
      chatId,
      `✅ تمت إضافة الكلمة:\n${word}: ${explanation}`
    );
    
  } catch (error) {
    console.error('خطأ في إضافة الكلمة:', error);
    await bot.sendMessage(chatId, '❌ حدث خطأ أثناء الإضافة!');
  }
});

// التحقق من تنسيق /addword
bot.onText(/^\/addword/, (msg) => {
  if (!msg.text.includes(':')) {
    bot.sendMessage(msg.chat.id, 
      '⚠️ التنسيق الصحيح: /addword الكلمة:الشرح'
    );
  }
});
// ========== [/نهاية الأمر] ========== //

// ========== [دوال الذكاء الاصطناعي] ========== //
async function handleDictionaryWord(word) {
  return `📖 شرح "${word}":\n${dictionary[word]}`;
}

async function explainWithGemini(input) {
  try {
    // إذا كانت الكلمة موجودة في القاموس نرجع شرحها
    if (dictionary[input]) {
      return handleDictionaryWord(input);
    }

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: input.includes('عتمة') || input.includes('لهجة') ?
              `اشرح "${input}" من لهجة عتمة اليمنية باختصار` :
              `أجب عن السؤال التالي باختصار: "${input}"`
          }]
        }]
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'لا يوجد شرح متاح';
  } catch (error) {
    console.error('خطأ في Gemini:', error.message);
    return 'حدث خطأ أثناء جلب الإجابة';
  }
}
// ========== [/نهاية الدوال] ========== //

// ========== [معالجة الرسائل] ========== //
async function handleWord(msg, text) {
  const chatId = msg.chat.id;
  const input = text.trim();

  try {
    const loadingMsg = await bot.sendMessage(chatId, '🔍 جاري البحث...');
    const explanation = await explainWithGemini(input);
    
    await bot.editMessageText(explanation, {
      chat_id: chatId,
      message_id: loadingMsg.message_id
    });

  } catch (error) {
    console.error('خطأ في المعالجة:', error);
    await bot.sendMessage(chatId, '⚠️ حدث خطأ، يرجى المحاولة لاحقاً');
  }
}

bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  await handleWord(msg, msg.text);
});
// ========== [/نهاية المعالجة] ========== //

// ========== [الأوامر الأساسية] ========== //
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    'مرحباً بك في بوت قاموس لهجة عتمة اليمنية! ✨\n\n' +
    '• اكتب أي كلمة لشرحها\n' +
    '• /words لعرض أمثلة\n' +
    '• /help للمساعدة'
  );
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, 
    '🛟 أوامر البوت:\n' +
    '- اكتب أي كلمة أو سؤال للحصول على إجابة\n' +
    '- /words: عرض أمثلة من القاموس\n' +
    (msg.from.id.toString() === ADMIN_ID ? '- /addword كلمة:شرح: إضافة كلمة (للمسؤول)' : '')
  );
});

bot.onText(/\/words/, (msg) => {
  const examples = Object.keys(dictionary).slice(0, 5).join('\n- ');
  bot.sendMessage(msg.chat.id, 
    `🔠 أمثلة على الكلمات:\n${examples || 'لا توجد كلمات بعد'}`
  );
});
// ========== [/نهاية الأوامر] ========== //

// ========== [إعدادات الويب هوك] ========== //
bot.setWebHook(`${WEBHOOK_URL}/webhook`, {
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message']
}).then(() => console.log('✅ تم تفعيل الويب هوك'));

app.post('/webhook', (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  res.json({ status: 'running', dictionary: Object.keys(dictionary).length });
});

app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على البورت ${PORT}`);
});
// ========== [/نهاية الإعدادات] ========== //

// معالجة الأخطاء
process.on('unhandledRejection', (err) => {
  console.error('⚠️ خطأ غير معالج:', err);
});
