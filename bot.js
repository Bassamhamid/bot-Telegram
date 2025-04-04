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
  port: process.env.PORT || 3001 // تغيير البورت الافتراضي
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
const PORT = process.env.PORT || 3001; // استخدام 3001 كبديل
const WEBHOOK_URL = process.env.WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

if (!token || !GEMINI_API_KEY || !ADMIN_ID || !WEBHOOK_URL || !WEBHOOK_SECRET) {
  console.error('❌ متغيرات بيئية مفقودة!');
  process.exit(1);
}

const bot = new TelegramBot(token, {
  polling: false,
  webHook: {
    port: PORT
  }
});

let dictionary = {};
try {
  dictionary = JSON.parse(fs.readFileSync(DICTIONARY_PATH));
  console.log(`✅ قاموس محمل (${Object.keys(dictionary).length} كلمة)`);
} catch (err) {
  console.error('❌ خطأ في تحميل القاموس:', err);
}

// الدوال والأوامر (تبقى كما هي بدون تغيير)
bot.onText(/^\/addword (.+?):(.+)$/, async (msg, match) => {
  // ... [الكود الحالي]
});

async function explainWithGemini(input) {
  // ... [الكود الحالي]
}

bot.on('message', async (msg) => {
  // ... [الكود الحالي]
});

// ===== الحل الجديد لمعالجة مشكلة البورت =====
const startServer = (port = PORT) => {
  const server = app.listen(port, async () => {
    console.log(`🚀 يعمل على البورت ${port}`);
    
    try {
      await bot.setWebHook(`${WEBHOOK_URL}/webhook`, {
        secret_token: WEBHOOK_SECRET,
        drop_pending_updates: true
      });
      console.log('✅ ويب هوك مفعل');
    } catch (err) {
      console.error('❌ فشل تفعيل الويب هوك:', err);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      const newPort = parseInt(port) + 1;
      console.log(`⚠️ جرب البورت ${newPort}...`);
      startServer(newPort);
    } else {
      console.error('❌ خطأ في الخادم:', err);
    }
  });
};

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

// بدء التشغيل
startServer();

process.on('unhandledRejection', (err) => {
  console.error('⚠️ خطأ غير معالج:', err);
});
