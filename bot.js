require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');

// تحميل المتغيرات
const token = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ID = process.env.ADMIN_ID;

const bot = new TelegramBot(token, { polling: true });

let dictionary = JSON.parse(fs.readFileSync('./dictionary.json', 'utf-8'));
const userCache = new Set();

// حفظ كلمة جديدة في القاموس
function saveWordToDictionary(word, explanation, user) {
  dictionary[word] = explanation;
  fs.writeFileSync('./dictionary.json', JSON.stringify(dictionary, null, 2), 'utf-8');

  // إرسال إشعار للمطور
  bot.sendMessage(
    ADMIN_ID,
    `تمت إضافة كلمة جديدة للقاموس:\nالكلمة: ${word}\nالمعنى: ${explanation}\nبواسطة: @${user.username || user.first_name}`
  );
}

// استدعاء Gemini
async function explainWithGemini(word) {
  try {
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      {
        contents: [{
          parts: [{
            text: `اشرح الكلمة "${word}" من لهجة عتمة اليمنية، وإذا لم تكن ضمن اللهجة أو غير معروفة، أخبرني بأنها غير موجودة في القاموس.`
          }]
        }]
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY
        }
      }
    );

    const output = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return output || '';
  } catch (error) {
    console.error('Gemini API Error:', error.message);
    return '';
  }
}

// التعامل مع الكلمات
async function handleWord(msg, word) {
  const chatId = msg.chat.id;
  const wordTrimmed = word.trim();
  const user = msg.from;

  if (dictionary[wordTrimmed]) {
    bot.sendMessage(chatId, `شرح "${wordTrimmed}":\n${dictionary[wordTrimmed]}`, {
      reply_markup: {
        inline_keyboard: [[{ text: 'إبلاغ عن خطأ في الشرح', callback_data: `report_${wordTrimmed}` }]]
      }
    });
  } else {
    const geminiExplanation = await explainWithGemini(wordTrimmed);

    if (!geminiExplanation || geminiExplanation.includes('غير موجودة') || geminiExplanation.includes('لا أعرف')) {
      bot.sendMessage(chatId, `عذرًا، لا توجد معلومات عن الكلمة "${wordTrimmed}".`);
    } else {
      bot.sendMessage(chatId, `شرح AI لكلمة "${wordTrimmed}":\n${geminiExplanation}`, {
        reply_markup: {
          inline_keyboard: [[{ text: 'إبلاغ عن خطأ في الشرح', callback_data: `report_${wordTrimmed}` }]]
        }
      });
      saveWordToDictionary(wordTrimmed, geminiExplanation, user);
    }
  }
}

// أوامر البوت
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  if (!userCache.has(chatId)) {
    userCache.add(chatId);
    bot.sendMessage(chatId, 'مرحبًا بك في بوت شرح لهجة "عتمة" اليمنية! أرسل أي كلمة لأشرحها لك.');
  } else {
    bot.sendMessage(chatId, 'أهلاً مجددًا! أرسل أي كلمة تريد شرحها.');
  }
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, 'اكتب أي كلمة من لهجة عتمة اليمنية وسأشرحها لك، أو استخدم /words لعرض بعض الأمثلة.');
});

bot.onText(/\/about/, (msg) => {
  bot.sendMessage(msg.chat.id, 'تم تطوير هذا البوت لشرح مفردات لهجة عتمة اليمنية باستخدام قاموس مخصص وذكاء صناعي من Gemini.');
});

bot.onText(/\/words/, (msg) => {
  const exampleWords = Object.keys(dictionary).slice(0, 10).join(', ');
  bot.sendMessage(msg.chat.id, `بعض الكلمات التي يمكنك تجربتها:\n${exampleWords}`);
});

// الرد على الضغط على زر "إبلاغ عن خطأ"
bot.on('callback_query', (callbackQuery) => {
  const chatId = callbackQuery.message.chat.id;
  const user = callbackQuery.from;
  const data = callbackQuery.data;

  if (data.startsWith('report_')) {
    const wordReported = data.replace('report_', '');

    bot.sendMessage(ADMIN_ID, `تم الإبلاغ عن خطأ في شرح الكلمة "${wordReported}" من قبل المستخدم: @${user.username || user.first_name}`);

    bot.answerCallbackQuery(callbackQuery.id, { text: 'تم إرسال بلاغك إلى المطور. شكراً لك!' });
  }
});

// التعامل مع أي رسالة نصية غير أوامر
bot.on('message', async (msg) => {
  const text = msg.text?.trim();
  if (text && !text.startsWith('/')) {
    await handleWord(msg, text);
  }
});
