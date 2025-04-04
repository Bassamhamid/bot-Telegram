require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// مسار ملف القاموس (باستخدام path.join لأمان أكثر)
const DICTIONARY_PATH = path.join(__dirname, 'dictionary.json');

// إنشاء ملف القاموس إذا لم يكن موجوداً
if (!fs.existsSync(DICTIONARY_PATH)) {
  fs.writeFileSync(DICTIONARY_PATH, JSON.stringify({}, null, 2), 'utf-8');
}

// تحميل المتغيرات البيئية
const token = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ID = process.env.ADMIN_ID;

// تأكد من وجود المتغيرات المطلوبة
if (!token || !GEMINI_API_KEY || !ADMIN_ID) {
  console.error('❌ يرجى تعيين جميع المتغيرات البيئية المطلوبة!');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

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
  
  // إرسال إشعار للمسؤول
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

console.log('🤖 البوت يعمل الآن...');
