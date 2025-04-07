require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');

// تحميل المتغيرات مع فحص دقيق
const getEnv = (key) => {
  const value = process.env[key]?.trim();
  if (!value) console.error(`❌ المتغير المطلوب مفقود: ${key}`);
  return value;
};

const config = {
  TELEGRAM_BOT_TOKEN: getEnv('TELEGRAM_BOT_TOKEN'),
  GEMINI_API_KEY: getEnv('GEMINI_API_KEY'),
  WEBHOOK_URL: getEnv('WEBHOOK_URL')?.replace(/\/+$/, ''),
  WEBHOOK_SECRET: getEnv('WEBHOOK_SECRET'), // تم تصحيح الخطأ الإملائي هنا
  PORT: getEnv('PORT') || 3000
};

console.log('⚙️ إعدادات التشغيل:', {
  PORT: config.PORT,
  WEBHOOK_ENABLED: !!(config.WEBHOOK_URL && config.WEBHOOK_SECRET),
  BOT_AVAILABLE: !!config.TELEGRAM_BOT_TOKEN
});

// إدارة القاموس
const DICTIONARY_PATH = path.join(__dirname, 'dictionary.json');
let dictionary = {};
try {
  dictionary = JSON.parse(fs.readFileSync(DICTIONARY_PATH));
  console.log(`📚 قاموس محمل (${Object.keys(dictionary).length} كلمة)`);
} catch (err) {
  fs.writeFileSync(DICTIONARY_PATH, JSON.stringify({}, null, 2));
  console.log('📝 تم إنشاء قاموس جديد');
}

// تهيئة البوت إذا كان التوكن متوفراً
let bot = null;
if (config.TELEGRAM_BOT_TOKEN) {
  try {
    bot = new TelegramBot(config.TELEGRAM_BOT_TOKEN, {
      polling: false,
      request: { 
        timeout: 10000,
        agent: new https.Agent({ keepAlive: true })
      }
    });
    console.log('🤖 تم تهيئة بوت التليجرام بنجاح');
    
    // إدارة أحداث البوت
    bot.on('polling_error', (error) => {
      console.error('🔴 خطأ في Polling:', error.message);
    });
    
    bot.on('webhook_error', (error) => {
      console.error('🔴 خطأ في Webhook:', error.message);
    });
    
  } catch (err) {
    console.error('❌ فشل تهيئة البوت:', err.message);
  }
} else {
  console.warn('⚠️ سيتم تعطيل ميزات البوت بسبب عدم وجود التوكن');
}

// تطبيق Express
const app = express();
app.use(express.json());

// Middleware لتسجيل الطلبات
app.use((req, res, next) => {
  console.log(`📩 ${req.method} ${req.path}`);
  next();
});

// مسار الويب هوك
app.post('/webhook', (req, res) => {
  if (!bot) return res.status(503).json({ error: 'Bot not initialized' });
  
  if (!config.WEBHOOK_SECRET || req.headers['x-telegram-bot-api-secret-token'] !== config.WEBHOOK_SECRET) {
    console.warn('⛔ محاولة وصول غير مصرح بها من:', req.ip);
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (err) {
    console.error('💥 خطأ في معالجة التحديث:', err);
    res.sendStatus(200); // نرسل 200 حتى لا يعيد التليجرام المحاولة
  }
});

// مسارات إضافية
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    bot_active: !!bot,
    webhook_configured: !!(config.WEBHOOK_URL && config.WEBHOOK_SECRET),
    dictionary_entries: Object.keys(dictionary).length,
    uptime: process.uptime()
  });
});

// تشغيل الخادم
const server = app.listen(config.PORT, async () => {
  console.log(`🚀 الخادم يعمل على: http://localhost:${config.PORT}`);
  
  if (bot && config.WEBHOOK_URL && config.WEBHOOK_SECRET) {
    try {
      const webhookUrl = `${config.WEBHOOK_URL}/webhook`;
      await bot.setWebHook(webhookUrl, {
        secret_token: config.WEBHOOK_SECRET,
        drop_pending_updates: true
      });
      console.log('✅ تم تفعيل الويب هوك بنجاح:', webhookUrl);
      
      // للحصول على معلومات الويب هوك (اختياري)
      const webhookInfo = await bot.getWebHookInfo();
      console.log('ℹ️ معلومات الويب هوك:', {
        url: webhookInfo.url,
        pending_updates: webhookInfo.pending_update_count
      });
    } catch (err) {
      console.error('❌ فشل تفعيل الويب هوك:', err.message);
      console.log('🔄 جرب تفعيل وضع Polling...');
      bot.startPolling().then(() => console.log('🔃 تم تفعيل وضع Polling'));
    }
  }
});

// إدارة الأخطاء
process.on('unhandledRejection', (err) => {
  console.error('⚠️ خطأ غير معالج:', err);
});

process.on('uncaughtException', (err) => {
  console.error('💥 خطأ غير متوقع:', err);
});

server.on('error', (err) => {
  console.error('💥 خطأ في الخادم:', err);
});
