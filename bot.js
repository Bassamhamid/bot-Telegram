require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const net = require('net');

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
const PORT = process.env.PORT || 10000; // تغيير البورت الافتراضي إلى 10000
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

// التحقق من المتغيرات البيئية المطلوبة
const requiredVars = {
  TELEGRAM_BOT_TOKEN: token,
  GEMINI_API_KEY: GEMINI_API_KEY,
  ADMIN_ID: ADMIN_ID,
  WEBHOOK_URL: WEBHOOK_URL,
  WEBHOOK_SECRET: WEBHOOK_SECRET
};

for (const [name, value] of Object.entries(requiredVars)) {
  if (!value) {
    console.error(`❌ المتغير البيئي ${name} غير معرّف!`);
    process.exit(1);
  }
}

// إنشاء البوت مع إعدادات Webhook
const bot = new TelegramBot(token, {
  webHook: {
    port: PORT
  },
  onlyFirstMatch: true
});

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
  ).catch(console.error);
}

// دالة للاستعلام من Gemini API (محدثة)
async function explainWithGemini(word) {
  try {
    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{
          parts: [{
            text: `اشرح الكلمة "${word}" من لهجة عتمة اليمنية، وإذا لم تكن معروفة أخبرني فقط أنها غير موجودة.`
          }]
        }]
      },
      {
        headers: { 
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        },
        timeout: 10000 // 10 ثواني كحد أقصى
      }
    );

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || 'لا يوجد شرح متاح';
  } catch (error) {
    console.error('🔴 خطأ في Gemini API:', {
      status: error.response?.status,
      data: error.response?.data,
      message: error.message
    });
    return 'حدث خطأ أثناء جلب الشرح من الذكاء الاصطناعي';
  }
}

// معالجة الكلمات المطلوبة (محدثة)
async function handleWord(msg, word) {
  const chatId = msg.chat.id;
  const wordTrimmed = word.trim();
  const user = msg.from;

  try {
    if (dictionary[wordTrimmed]) {
      await bot.sendMessage(chatId, `📖 شرح "${wordTrimmed}":\n${dictionary[wordTrimmed]}`, {
        reply_markup: {
          inline_keyboard: [[{ text: '⚠️ إبلاغ عن خطأ', callback_data: `report_${wordTrimmed}` }]
        }
      });
    } else {
      const loadingMsg = await bot.sendMessage(chatId, '🔍 جاري البحث عن شرح...');
      
      const geminiExplanation = await explainWithGemini(wordTrimmed);
      
      if (geminiExplanation.includes('غير موجودة') || geminiExplanation.includes('لا أعرف')) {
        await bot.editMessageText(`❌ لا يوجد شرح لكلمة "${wordTrimmed}" في القاموس.`, {
          chat_id: chatId,
          message_id: loadingMsg.message_id
        });
      } else {
        await bot.editMessageText(`🤖 شرح "${wordTrimmed}":\n${geminiExplanation}`, {
          chat_id: chatId,
          message_id: loadingMsg.message_id,
          reply_markup: {
            inline_keyboard: [[{ text: '⚠️ إبلاغ عن خطأ', callback_data: `report_${wordTrimmed}` }]
          }
        });
        saveWordToDictionary(wordTrimmed, geminiExplanation, user);
      }
    }
  } catch (error) {
    console.error('🔴 خطأ في معالجة الكلمة:', error);
    await bot.sendMessage(chatId, '⚠️ حدث خطأ أثناء معالجة طلبك، يرجى المحاولة لاحقاً.');
  }
}

// تفعيل Webhook مع التحسينات
bot.setWebHook(`${WEBHOOK_URL}/webhook`, {
  certificate: null,
  secret_token: WEBHOOK_SECRET,
  max_connections: 50,
  allowed_updates: ['message', 'callback_query']
}).then(() => {
  console.log('✅ تم تفعيل الويب هوك بنجاح على:', WEBHOOK_URL);
}).catch(err => {
  console.error('❌ فشل تفعيل الويب هوك:', err);
  process.exit(1);
});

// endpoint لاستقبال التحديثات (محدث)
app.post('/webhook', (req, res) => {
  try {
    // التحقق من السر السري
    if (req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
      console.warn('⚠️ محاولة وصول غير مصرح بها من IP:', req.ip);
      return res.sendStatus(403);
    }
    
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error('❌ خطأ في معالجة التحديث:', error);
    res.status(500).send('Internal Server Error');
  }
});

// الأحداث الأساسية
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await bot.sendMessage(chatId, 'مرحباً بك في بوت قاموس لهجة عتمة اليمنية! ✨\n\nاكتب أي كلمة لشرحها.');
  } catch (error) {
    console.error('خطأ في أمر /start:', error);
  }
});

bot.onText(/\/help/, async (msg) => {
  try {
    await bot.sendMessage(msg.chat.id, '🛟 المساعدة:\n- اكتب أي كلمة لشرحها\n- /words لعرض أمثلة\n- /about لمعلومات عن البوت');
  } catch (error) {
    console.error('خطأ في أمر /help:', error);
  }
});

bot.onText(/\/words/, async (msg) => {
  try {
    const examples = Object.keys(dictionary).slice(0, 5).join('\n- ');
    await bot.sendMessage(msg.chat.id, `🔠 أمثلة على الكلمات:\n- ${examples || 'لا توجد كلمات بعد'}`);
  } catch (error) {
    console.error('خطأ في أمر /words:', error);
  }
});

// معالجة التقارير
bot.on('callback_query', async (callbackQuery) => {
  try {
    const data = callbackQuery.data;
    if (data.startsWith('report_')) {
      const word = data.replace('report_', '');
      await bot.answerCallbackQuery(callbackQuery.id, { text: 'تم إرسال التقرير للمسؤول ✅' });
      await bot.sendMessage(ADMIN_ID, `⚠️ تقرير جديد:\nالكلمة: ${word}\nمن المستخدم: ${callbackQuery.from.username || callbackQuery.from.first_name}`);
    }
  } catch (error) {
    console.error('خطأ في معالجة التقرير:', error);
  }
});

// معالجة الرسائل العادية
bot.on('message', async (msg) => {
  try {
    if (!msg.text || msg.text.startsWith('/')) return;
    await handleWord(msg, msg.text);
  } catch (error) {
    console.error('خطأ في معالجة الرسالة:', error);
  }
});

// صفحة رئيسية للتأكد من أن الخدمة تعمل
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'running',
    service: 'قاموس لهجة عتمة اليمنية',
    version: '2.0.1',
    webhook: `${WEBHOOK_URL}/webhook`,
    uptime: process.uptime()
  });
});

// بدء الخادم مع معالجة مشكلة البورت المشغول
const startServer = (port) => {
  const tester = net.createServer()
    .once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`🔄 البورت ${port} مشغول، جرب ${port + 1}`);
        startServer(port + 1);
      }
    })
    .once('listening', () => {
      tester.close(() => {
        app.listen(port, () => {
          console.log(`🚀 الخادم يعمل على البورت ${port}`);
          console.log(`🔗 رابط الويب هوك: ${WEBHOOK_URL}/webhook`);
        });
      });
    })
    .listen(port);
};

startServer(PORT);

// معالجة الأخطاء غير الملتقطة
process.on('unhandledRejection', (error) => {
  console.error('⚠️ خطأ غير معالج (Rejection):', error);
});

process.on('uncaughtException', (error) => {
  console.error('⚠️ استثناء غير معالج (Exception):', error);
  if (error.code === 'EADDRINUSE') {
    console.log('🔄 إعادة تشغيل الخادم على بورت جديد...');
    startServer(PORT + 1);
  }
});

// إغلاق نظيف عند استقبال إشارة الإيقاف
process.on('SIGTERM', () => {
  console.log('🛑 استقبال إشارة إيقاف، إغلاق الخادم...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 استقبال إشارة إنهاء، إغلاق الخادم...');
  process.exit(0);
});
