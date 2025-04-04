require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

console.log('=== إعدادات البوت ===');
console.log({
  token: process.env.TELEGRAM_BOT_TOKEN ? '✔ موجود' : '❌ مفقود',
  webhookUrl: process.env.WEBHOOK_URL,
  port: process.env.PORT || 3001
});

const app = express();

app.use((req, res, next) => {
  console.log(`📩 ${req.method} ${req.path}`);
  next();
});

app.use(express.json());

const DICTIONARY_PATH = path.join(__dirname, 'dictionary.json');
if (!fs.existsSync(DICTIONARY_PATH)) {
  fs.writeFileSync(DICTIONARY_PATH, JSON.stringify({}, null, 2));
}

const token = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ADMIN_ID = process.env.ADMIN_ID;
const PORT = parseInt(process.env.PORT, 10) || 3001;
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!token || !GEMINI_API_KEY || !ADMIN_ID || !WEBHOOK_URL || !WEBHOOK_SECRET) {
  console.error('❌ متغيرات بيئية مفقودة!');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: false });

let dictionary = {};
try {
  dictionary = JSON.parse(fs.readFileSync(DICTIONARY_PATH));
  console.log(`✅ قاموس محمل (${Object.keys(dictionary).length} كلمة)`);
} catch (err) {
  console.error('❌ خطأ في تحميل القاموس:', err);
}

// ===== أوامر البوت =====
bot.onText(/^\/addword (.+?):(.+)$/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [_, word, meaning] = match;

  dictionary[word.trim()] = meaning.trim();
  fs.writeFileSync(DICTIONARY_PATH, JSON.stringify(dictionary, null, 2));

  bot.sendMessage(chatId, `✅ تمت إضافة الكلمة "${word}"`);
});

async function explainWithGemini(input) {
  try {
    const response = await axios.post(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
      {
        contents: [{ parts: [{ text: input }] }]
      },
      {
        params: { key: GEMINI_API_KEY }
      }
    );

    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '❌ لم يتم الحصول على رد.';
  } catch (err) {
    console.error('❌ خطأ في طلب Gemini:', err.message);
    return '⚠️ حدث خطأ أثناء التواصل مع Gemini.';
  }
}

bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text?.trim();

  if (!text || text.startsWith('/')) return;

  if (dictionary[text]) {
    bot.sendMessage(chatId, `📖 المعنى: ${dictionary[text]}`);
  } else {
    const reply = await explainWithGemini(`اشرح كلمة باللهجة اليمنية "عتمة": ${text}`);
    bot.sendMessage(chatId, reply);
  }
});

// ===== معالجة الويب هوك =====
app.post('/webhook', (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
    console.warn('⛔ وصول غير مصرح به');
    return res.sendStatus(403);
  }

  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error('💥 خطأ المعالجة:', err);
    res.sendStatus(200);
  }
});

app.get('/', (req, res) => {
  res.json({
    status: 'running',
    dictionaryCount: Object.keys(dictionary).length
  });
});

// ===== بدء الخادم وتفعيل الويب هوك =====
const startServer = (port = PORT, maxTries = 10, tryCount = 0) => {
  const server = app.listen(port, async () => {
    console.log(`🚀 يعمل على البورت ${port}`);
    try {
      await bot.setWebHook(`${WEBHOOK_URL}/webhook`, {
        secret_token: WEBHOOK_SECRET,
        drop_pending_updates: true
      });
      console.log('✅ ويب هوك مفعل');
    } catch (err) {
      console.error('❌ فشل تفعيل الويب هوك:', err.message);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      if (tryCount < maxTries) {
        const newPort = port + 1;
        console.warn(`⚠️ البورت ${port} مستخدم، تجربة البورت ${newPort}...`);
        startServer(newPort, maxTries, tryCount + 1);
      } else {
        console.error('❌ لا يوجد بورت متاح بعد محاولات متعددة.');
        process.exit(1);
      }
    } else {
      console.error('❌ خطأ في الخادم:', err);
      process.exit(1);
    }
  });
};

startServer();

process.on('unhandledRejection', (err) => {
  console.error('⚠️ خطأ غير معالج:', err);
});
