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

const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
const app = express();

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

// دالة شرح Gemini
async function explainWithGemini(text) {
  const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent';

  let prompt = `اشرح معنى كلمة "${text}" في لهجة عتمة اليمنية بشكل دقيق.`;
  if (dictionary[text]) {
    prompt += ` حسب قاموس محلي، الكلمة تعني: "${dictionary[text]}". استخدم هذه المعلومة كمرجع إذا كانت دقيقة.`;
  } else {
    prompt += ` إذا لم تكن معروفة، قل أنها غير معروفة.`;
  }

  try {
    const response = await axios.post(
      API_URL,
      {
        contents: [{
          parts: [{ text: prompt }]
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
    return result || '❌ لم أتمكن من العثور على شرح مناسب';
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

✍️ أرسل أي كلمة أو اسأل عنها وسأشرحها لك
📚 /words - لعرض الكلمات المخزنة
➕ /addword [الكلمة]:[الشرح] - لإضافة كلمة جديدة (المشرف فقط)
  `.trim());
});

bot.onText(/^\/words$/, (msg) => {
  const words = Object.keys(dictionary);
  bot.sendMessage(
    msg.chat.id,
    words.length ? `📖 الكلمات المخزنة:\n\n${words.join('\n')}` : '📭 لا توجد كلمات مسجلة بعد'
  );
});

// أمر إضافة كلمة للمشرف فقط
bot.onText(/^\/addword (.+)/, (msg, match) => {
  const userId = msg.from.id.toString();
  const adminId = process.env.ADMIN_ID;

  if (userId !== adminId) {
    return bot.sendMessage(msg.chat.id, '⛔ هذا الأمر مخصص للمشرف فقط.');
  }

  const input = match[1];
  const [word, ...definitionParts] = input.split(':');
  const definition = definitionParts.join(':').trim();

  if (!word || !definition) {
    return bot.sendMessage(msg.chat.id, '⚠️ الصيغة غير صحيحة. استخدم:\n/addword الكلمة:الشرح');
  }

  dictionary[word.trim()] = definition;
  fs.writeFileSync(DICTIONARY_PATH, JSON.stringify(dictionary, null, 2));

  bot.sendMessage(msg.chat.id, `✅ تمت إضافة الكلمة "${word.trim()}" بنجاح.`);
});

// معالجة الرسائل
bot.on('message', async (msg) => {
  const text = msg.text?.trim();
  if (!text || text.startsWith('/')) return;

  const chatId = msg.chat.id;

  let wordToCheck = text;
  const patterns = [
    /(?:ما معنى|وش معنى|اشرح|يعني ايش|تعني ايش)\s+كلمة?\s*([\u0600-\u06FF]+)/i,
    /^([\u0600-\u06FF]+)$/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      wordToCheck = match[1].trim();
      break;
    }
  }

  try {
    if (dictionary[wordToCheck]) {
      await bot.sendMessage(chatId, `📖 "${wordToCheck}":\n${dictionary[wordToCheck]}`);
    }

    const loadingMsg = await bot.sendMessage(chatId, '🔍 جاري البحث عن الشرح...');
    const explanation = await explainWithGemini(wordToCheck);

    await bot.editMessageText(explanation, {
      chat_id: chatId,
      message_id: loadingMsg.message_id
    });

  } catch (error) {
    console.error('❌ خطأ في معالجة الرسالة:', error);
    bot.sendMessage(chatId, '⚠️ حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.');
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
    res.sendStatus(200);
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

process.on('unhandledRejection', (error) => {
  console.error('⚠️ خطأ غير معالج:', error);
});
