require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const https = require('https');

// تحميل وتوثيق المتغيرات البيئية
const config = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN?.trim(),
  GEMINI_API_KEY: process.env.GEMINI_API_KEY?.trim(),
  WEBHOOK_URL: process.env.WEBHOOK_URL?.trim()?.replace(/\/+$/, ''),
  WEBHOOK_SECRET: process.env.WEBHOOK_SECRET?.trim(),
  PORT: process.env.PORT || 3000
};

console.log('🔍 متغيرات البيئة:', {
  TELEGRAM_BOT_TOKEN: config.TELEGRAM_BOT_TOKEN ? '*** موجود ***' : '❌ مفقود',
  WEBHOOK_URL: config.WEBHOOK_URL || '❌ مفقود',
  WEBHOOK_SECRET: config.WEBHOOK_SECRET ? '*** موجود ***' : '❌ مفقود',
  PORT: config.PORT
});

// تهيئة البوت مع خيارات متقدمة
const botOptions = {
  polling: false,
  request: {
    timeout: 10000,
    agent: new https.Agent({ keepAlive: true })
  }
};

const bot = config.TELEGRAM_BOT_TOKEN ? new TelegramBot(config.TELEGRAM_BOT_TOKEN, botOptions) : null;

if (!bot) {
  console.error('❌ لم يتم تهيئة بوت التليجرام بسبب عدم وجود التوكن');
}

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
  if (!config.GEMINI_API_KEY) {
    console.error('❌ مفتاح Gemini غير متوفر');
    return '⚠️ خدمة الشرح غير متوفرة حالياً';
  }

  const API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent';

  const foundWords = {};
  Object.keys(dictionary).forEach(word => {
    if (text.includes(word)) {
      foundWords[word] = dictionary[word];
    }
  });

  let prompt = `اشرح معنى "${text}" في لهجة عتمة اليمنية بشكل دقيق.`;

  if (Object.keys(foundWords).length > 0) {
    prompt += `\n\nحسب قاموس محلي، تحتوي العبارة على الكلمات التالية:\n`;
    for (const [word, meaning] of Object.entries(foundWords)) {
      prompt += `- "${word}": ${meaning}\n`;
    }
    prompt += `استخدم هذه المعلومات كمرجع إذا كانت دقيقة.`;
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
        params: { key: config.GEMINI_API_KEY },
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': config.GEMINI_API_KEY
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

// تهيئة تطبيق Express
const app = express();
app.use(express.json());

// Middleware لتسجيل الطلبات
app.use((req, res, next) => {
  console.log(`📩 ${req.method} ${req.path}`);
  next();
});

// أوامر البوت (إذا كان البوت متاحاً)
if (bot) {
  bot.onText(/^\/start$/, (msg) => {
    bot.sendMessage(msg.chat.id, `
مرحباً! 👋
أنا بوت متخصص في شرح مفردات لهجة عتمة اليمنية.

✍️ أرسل أي كلمة أو عبارة وسأشرحها لك
📚 /words - لعرض الكلمات المخزنة
    `.trim());
  });

  bot.onText(/^\/words$/, (msg) => {
    const words = Object.keys(dictionary);
    bot.sendMessage(
      msg.chat.id,
      words.length ? `📖 الكلمات المخزنة:\n\n${words.join('\n')}` : '📭 لا توجد كلمات مسجلة بعد'
    );
  });

  // معالجة الرسائل
  bot.on('message', async (msg) => {
    const text = msg.text?.trim();
    if (!text || text.startsWith('/')) return;

    const chatId = msg.chat.id;

    try {
      const directMatch = dictionary[text];
      if (directMatch) {
        return await bot.sendMessage(chatId, `📖 "${text}":\n${directMatch}`);
      }

      const foundWords = {};
      Object.keys(dictionary).forEach(word => {
        if (text.includes(word)) {
          foundWords[word] = dictionary[word];
        }
      });

      if (Object.keys(foundWords).length > 0) {
        let response = `🔍 وجدت هذه الكلمات في القاموس:\n\n`;
        for (const [word, meaning] of Object.entries(foundWords)) {
          response += `- "${word}": ${meaning}\n`;
        }
        await bot.sendMessage(chatId, response);
      }

      const loadingMsg = await bot.sendMessage(chatId, '🔍 جاري البحث عن الشرح...');
      const explanation = await explainWithGemini(text);

      await bot.editMessageText(explanation, {
        chat_id: chatId,
        message_id: loadingMsg.message_id
      });

    } catch (error) {
      console.error('❌ خطأ في معالجة الرسالة:', error);
      if (bot.sendMessage) {
        bot.sendMessage(chatId, '⚠️ حدث خطأ غير متوقع. يرجى المحاولة لاحقاً.');
      }
    }
  });

  // إدارة أخطاء البوت
  bot.on('polling_error', (error) => {
    console.error('🔴 خطأ في Polling:', error.message);
  });

  bot.on('webhook_error', (error) => {
    console.error('🔴 خطأ في Webhook:', error.message);
  });
}

// نقطة نهاية الويب هوك
app.post('/webhook', (req, res, next) => {
  if (!config.WEBHOOK_SECRET) {
    console.warn('⛔ محاولة وصول إلى ويب هوك غير مفعل');
    return res.status(501).send('Webhook not configured');
  }

  if (req.headers['x-telegram-bot-api-secret-token'] !== config.WEBHOOK_SECRET) {
    console.warn('⛔ محاولة وصول غير مصرح بها من IP:', req.ip);
    return res.sendStatus(403);
  }
  next();
}, (req, res) => {
  if (!bot) {
    return res.status(503).send('Bot not initialized');
  }
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// نقطة فحص الصحة
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    bot_initialized: !!bot,
    webhook_configured: !!(config.WEBHOOK_URL && config.WEBHOOK_SECRET),
    dictionary_entries: Object.keys(dictionary).length
  });
});

// تشغيل الخادم
const startServer = async () => {
  const server = app.listen(config.PORT, () => {
    console.log(`🚀 الخادم يعمل على البورت ${config.PORT}`);
    console.log(`🌐 عنوان الويب هوك: ${config.WEBHOOK_URL || 'غير مضبوط'}`);
  });

  // تفعيل الويب هوك إذا كانت جميع المتطلبات متوفرة
  if (bot && config.WEBHOOK_URL && config.WEBHOOK_SECRET) {
    try {
      const webhookUrl = `${config.WEBHOOK_URL}/webhook`;
      console.log(`🔄 جاري تفعيل الويب هوك على: ${webhookUrl}`);
      
      await bot.setWebHook(webhookUrl, {
        secret_token: config.WEBHOOK_SECRET,
        drop_pending_updates: true
      });
      
      const webhookInfo = await bot.getWebHookInfo();
      console.log('✅ معلومات الويب هوك:', {
        url: webhookInfo.url,
        pending_updates: webhookInfo.pending_update_count,
        last_error: webhookInfo.last_error_date
      });
    } catch (error) {
      console.error('❌ فشل تفعيل الويب هوك:', {
        message: error.message,
        stack: error.stack
      });
      
      // الانتقال لوضع Polling كحالة احتياطية
      console.log('🔄 تفعيل وضع Polling كبديل');
      bot.startPolling();
    }
  } else if (bot) {
    console.warn('⚠️ استخدام وضع Polling بسبب نقص متغيرات الويب هوك');
    bot.startPolling();
  }

  return server;
};

// إدارة الأخطاء غير المعالجة
process.on('unhandledRejection', (error) => {
  console.error('⚠️ خطأ غير معالج:', error);
});

process.on('uncaughtException', (error) => {
  console.error('💥 خطأ غير متوقع:', error);
});

// بدء التشغيل
startServer().catch(err => {
  console.error('💥 فشل تشغيل الخادم:', err);
  process.exit(1);
});
