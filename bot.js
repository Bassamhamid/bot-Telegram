require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// تحقق من المتغيرات البيئية
const requiredVars = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  ADMIN_ID: process.env.ADMIN_ID,
  WEBHOOK_URL: process.env.WEBHOOK_URL,
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET
};

for (const [name, value] of Object.entries(requiredVars)) {
  if (!value) {
    console.error(`❌ المتغير المطلوب مفقود: ${name}`);
    process.exit(1);
  }
}

// تحويل ADMIN_ID إلى رقم
const adminId = parseInt(process.env.ADMIN_ID, 10);

// إعداد البوت والتطبيق
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const app = express();

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  console.log(`📩 ${req.method} ${req.path}`);
  next();
});

// إدارة القاموس
const DICTIONARY_PATH = path.join(__dirname, 'dictionary.json');
let dictionary = {};

try {
  if (fs.existsSync(DICTIONARY_PATH)) {
    dictionary = JSON.parse(fs.readFileSync(DICTIONARY_PATH));
    console.log(`📚 قاموس محمل (${Object.keys(dictionary).length} كلمة)`);
  } else {
    fs.writeFileSync(DICTIONARY_PATH, JSON.stringify({}, null, 2));
    console.log('📝 تم إنشاء ملف قاموس جديد');
  }
} catch (err) {
  console.error('❌ خطأ في إدارة القاموس:', err);
}

// دالة Gemini المعدلة
async function explainWithGemini(text) {
  const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent';
  
  try {
    console.log(`🔍 البحث عن شرح لكلمة: ${text}`);
    const response = await axios.post(
      API_URL,
      {
        contents: [{
          parts: [{
            text: `اشرح معنى كلمة "${text}" في لهجة عتمة اليمنية بشكل دقيق. إذا كانت الكلمة غير موجودة، قل أنها غير معروفة.`
          }]
        }]
      },
      {
        params: { key: process.env.GEMINI_API_KEY },
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': process.env.GEMINI_API_KEY
        }
      }
    );

    const result = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return result || '❌ لم أتمكن من العثور على شرح مناسب.';
  } catch (error) {
    console.error('💥 خطأ في Gemini API:', {
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    });

    if (error.response?.status === 404) {
      return '⚠️ خدمة الشرح غير متاحة حالياً. جرب لاحقاً.';
    }
    return '⚠️ حدث خطأ أثناء محاولة الشرح. يرجى المحاولة لاحقاً.';
  }
}

// أوامر البوت

bot.onText(/^\/start$/, (msg) => {
  bot.sendMessage(msg.chat.id, `
مرحباً! 👋
أنا بوت متخصص في شرح مفردات لهجة عتمة اليمنية.

✍️ أرسل أي كلمة وسأحاول شرحها
📚 /words - لعرض الكلمات المخزنة
🛠️ /addword كلمة = شرح (للمشرف فقط)
  `.trim());
});

bot.onText(/^\/words$/, (msg) => {
  const words = Object.keys(dictionary);
  bot.sendMessage(
    msg.chat.id,
    words.length
      ? `📖 الكلمات المخزنة:\n\n${words.join('\n')}`
      : '📭 لا توجد كلمات مسجلة بعد.'
  );
});

// أمر إضافة كلمة (للمشرف فقط)
bot.onText(/^\/addword (.+)$/, (msg, match) => {
  const userId = msg.from.id;
  const chatId = msg.chat.id;

  if (userId !== adminId) {
    return bot.sendMessage(chatId, '⛔ هذا الأمر مخصص للمشرف فقط.');
  }

  const input = match[1].trim();
  const [word, ...definitionParts] = input.split('=');
  const wordClean = word.trim();
  const definition = definitionParts.join('=').trim();

  if (!wordClean || !definition) {
    return bot.sendMessage(chatId, '❗️صيغة الأمر غير صحيحة.\nاستخدم:\n`/addword كلمة = شرح`', { parse_mode: 'Markdown' });
  }

  if (dictionary[wordClean]) {
    return bot.sendMessage(chatId, `⚠️ الكلمة "${wordClean}" موجودة مسبقاً في القاموس.`);
  }

  dictionary[wordClean] = definition;
  fs.writeFileSync(DICTIONARY_PATH, JSON.stringify(dictionary, null, 2));

  bot.sendMessage(chatId, `✅ تمت إضافة الكلمة *${wordClean}* إلى القاموس.`, { parse_mode: 'Markdown' });
});

// الرسائل العادية
bot.on('message', async (msg) => {
  const text = msg.text?.trim();
  if (!text || text.startsWith('/')) return;

  try {
    const chatId = msg.chat.id;

    if (dictionary[text]) {
      return bot.sendMessage(chatId, `📖 *${text}*:\n${dictionary[text]}`, { parse_mode: 'Markdown' });
    }

    const loadingMsg = await bot.sendMessage(chatId, '🔍 جاري البحث عن الشرح...');
    const explanation = await explainWithGemini(text);

    await bot.editMessageText(explanation, {
      chat_id: chatId,
      message_id: loadingMsg.message_id
    });

  } catch (error) {
    console.error('❌ خطأ في معالجة الرسالة:', error);
    bot.sendMessage(msg.chat.id, '⚠️ حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.');
  }
});

// إدارة الويب هوك
app.post('/webhook', (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) {
    console.warn('⛔ محاولة وصول غير مصرح بها');
    return res.sendStatus(403);
  }

  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error('💥 خطأ في معالجة التحديث:', error);
    res.sendStatus(200); // لمنع Telegram من إعادة المحاولة
  }
});

// تشغيل الخادم
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 الخادم يعمل على البورت ${PORT}`);
  try {
    await bot.setWebHook(`${process.env.WEBHOOK_URL}/webhook`, {
      secret_token: process.env.WEBHOOK_SECRET,
      drop_pending_updates: true
    });
    console.log('✅ تم تفعيل الويب هوك بنجاح');
  } catch (error) {
    console.error('❌ فشل تفعيل الويب هوك:', error);
  }
});

// معالجة الأخطاء
process.on('unhandledRejection', (error) => {
  console.error('⚠️ خطأ غير معالج:', error);
});
