require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// تهيئة Express
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// تأكد من وجود المتغيرات المطلوبة
if (!token || !GEMINI_API_KEY || !ADMIN_ID || !WEBHOOK_URL || !WEBHOOK_SECRET) {
  console.error('❌ يرجى تعيين جميع المتغيرات البيئية المطلوبة!');
  process.exit(1);
}

// إنشاء البوت بدون polling
const bot = new TelegramBot(token);

// تحميل القاموس
let dictionary = {};
try {
  dictionary = JSON.parse(fs.readFileSync(DICTIONARY_PATH, 'utf-8'));
} catch (err) {
  console.error('❌ خطأ في قراءة ملف القاموس:', err.message);
}

const userCache = new Set();

// دالة لحفظ الكلمات الجديدة
function saveWordToDictionary(word, explanation, user) {
  dictionary[word] = explanation;
  fs.writeFileSync(DICTIONARY_PATH, JSON.stringify(dictionary, null, 2), 'utf-8');
  
  bot.sendMessage(
    ADMIN_ID,
    `تمت إضافة كلمة جديدة:\nالكلمة: ${word}\nالشرح: ${explanation}\nبواسطة: @${user.username || user.first_name}`
  );
}

// دالة للاستعلام من Gemini API
async function explainWithGemini(word) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `اشرح الكلمة "${word}" من لهجة عتمة اليمنية، وإذا لم تكن معروفة أخبرني فقط أنها غير موجودة.`
          }]
        }]
      },
      {
        headers: { 'Content-Type': 'application/json' }
      }
    );

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'لا يوجد شرح متاح';
  } catch (error) {
    console.error('🔴 خطأ في Gemini API:', error.message);
    return 'حدث خطأ أثناء جلب الشرح من الذكاء الاصطناعي';
  }
}

// معالجة الكلمات المطلوبة
async function handleWord(msg, word) {
  const chatId = msg.chat.id;
  const wordTrimmed = word.trim();
  const user = msg.from;

  if (dictionary[wordTrimmed]) {
    bot.sendMessage(chatId, `📖 شرح "${wordTrimmed}":\n${dictionary[wordTrimmed]}`, {
      reply_markup: {
        inline_keyboard: [[{ text: '⚠️ إبلاغ عن خطأ', callback_data: `report_${wordTrimmed}` }]]
      }
    });
  } else {
    const loadingMsg = await bot.sendMessage(chatId, '🔍 جاري البحث عن شرح...');

    try {
      const geminiExplanation = await explainWithGemini(wordTrimmed);

      if (geminiExplanation.includes('غير موجودة') || geminiExplanation.includes('لا أعرف')) {
        bot.editMessageText(`❌ لا يوجد شرح لكلمة "${wordTrimmed}" في القاموس.`, {
          chat_id: chatId,
          message_id: loadingMsg.message_id
        });
      } else {
        bot.editMessageText(`🤖 شرح "${wordTrimmed}":\n${geminiExplanation}`, {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          reply_markup: {
            inline_keyboard: [[{ text: '⚠️ إبلاغ عن خطأ', callback_data: `report_${wordTrimmed}` }]]
          }
        });
        saveWordToDictionary(wordTrimmed, geminiExplanation, user);
      }
    } catch (error) {
      bot.editMessageText('⚠️ حدث خطأ أثناء معالجة طلبك.', {
        chat_id: chatId,
        message_id: loadingMsg.message_id
      });
    }
  }
}

// تفعيل Webhook مع السر السري
bot.setWebhook(`${WEBHOOK_URL}/webhook`, {
  secret_token: WEBHOOK_SECRET
}).then(() => {
  console.log('✅ تم تفعيل الويب هوك بنجاح');
}).catch(err => {
  console.error('❌ فشل تفعيل الويب هوك:', err.message);
});

// endpoint لاستقبال التحديثات
app.post('/webhook', (req, res) => {
  // التحقق من السر السري
  if (req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }
  
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// الأوامر الأساسية
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'مرحباً بك في بوت قاموس لهجة عتمة اليمنية! ✨\n\nاكتب أي كلمة لشرحها.');
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, '🛟 المساعدة:\n- اكتب أي كلمة لشرحها\n- /words لعرض أمثلة\n- /about لمعلومات عن البوت');
});

bot.onText(/\/words/, (msg) => {
  const examples = Object.keys(dictionary).slice(0, 5).join('\n- ');
  bot.sendMessage(msg.chat.id, `🔠 أمثلة على الكلمات:\n- ${examples || 'لا توجد كلمات بعد'}`);
});

// معالجة التقارير
bot.on('callback_query', async (callbackQuery) => {
  const data = callbackQuery.data;
  if (data.startsWith('report_')) {
    const word = data.replace('report_', '');
    await bot.answerCallbackQuery(callbackQuery.id, { text: 'تم إرسال التقرير للمسؤول ✅' });
    bot.sendMessage(ADMIN_ID, `⚠️ تقرير جديد:\nالكلمة: ${word}\nمن المستخدم: ${callbackQuery.from.username || callbackQuery.from.first_name}`);
  }
});

// معالجة الرسائل العادية
bot.on('message', async (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  await handleWord(msg, msg.text);
});

// صفحة رئيسية للتأكد من أن الخدمة تعمل
app.get('/', (req, res) => {
  res.send('🤖 البوت يعمل في وضع الويب هوك');
});

// بدء الخادم
app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
  console.log(`🌐 Webhook URL: ${WEBHOOK_URL}/webhook`);
  console.log(`🔒 Webhook Secret: ${WEBHOOK_SECRET}`);
});
