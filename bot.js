require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ========== إعداد نظام التسجيل (Logging) المحسن ========== //
const logStream = fs.createWriteStream(path.join(__dirname, 'bot.log'), { flags: 'a' });
const requestLogStream = fs.createWriteStream(path.join(__dirname, 'requests.log'), { flags: 'a' });

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  logStream.write(logMessage);
  console[level](logMessage);
}

function logRequest(req) {
  const timestamp = new Date().toISOString();
  requestLogStream.write(`[${timestamp}] ${req.method} ${req.url} - IP: ${req.ip}\n`);
}

// ========== التحقق الشامل من المتغيرات البيئية ========== //
const requiredEnvVars = [
  'TELEGRAM_TOKEN',
  'GEMINI_API_KEY',
  'WEBHOOK_SECRET',
  'RENDER_EXTERNAL_HOSTNAME'
];

const envErrors = requiredEnvVars.filter(varName => !process.env[varName]);
if (envErrors.length > 0) {
  log(`Missing required environment variables: ${envErrors.join(', ')}`, 'error');
  process.exit(1);
}

// ========== تهيئة البوت وGemini مع تحسينات الأمان ========== //
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {
  polling: false,
  onlyFirstMatch: true,
  request: {
    timeout: 10000,
    agent: null
  }
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.use(express.json());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));

// ========== إعداد Webhook مع تحسينات الأمان ========== //
const webhookUrl = process.env.WEBHOOK_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/webhook`;

async function setupWebhook() {
  try {
    const result = await bot.setWebHook(webhookUrl, {
      secret_token: process.env.WEBHOOK_SECRET,
      max_connections: 40,
      drop_pending_updates: true
    });
    log(`✅ Webhook configured successfully at: ${webhookUrl}`);
    return result;
  } catch (error) {
    log(`❌ Failed to set webhook: ${error.message}`, 'error');
    throw error;
  }
}

// ========== Middleware للتحقق من الأمان ========== //
app.use((req, res, next) => {
  logRequest(req);
  next();
});

// ========== معالجة Webhook مع تحسينات الأمان ========== //
app.post('/webhook', (req, res) => {
  const authMethods = [
    req.headers['x-telegram-bot-api-secret-token'],
    req.query.secret
  ];

  if (!authMethods.includes(process.env.WEBHOOK_SECRET)) {
    log(`Unauthorized access attempt from IP: ${req.ip}`, 'warn');
    return res.status(403).json({ 
      status: 'error',
      message: 'Forbidden: Invalid or missing secret token'
    });
  }

  try {
    log(`Processing update: ${JSON.stringify(req.body)}`, 'debug');
    bot.processUpdate(req.body);
    res.json({ status: 'ok' });
  } catch (error) {
    log(`Error processing update: ${error.message}`, 'error');
    res.status(500).json({ 
      status: 'error',
      message: 'Internal server error'
    });
  }
});

// ========== نقاط النهاية الجديدة ========== //
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/words', (req, res) => {
  res.json({
    status: 'OK',
    words: Object.keys(DICTIONARY),
    count: Object.keys(DICTIONARY).length
  });
});

// ========== قاموس الكلمات المحسن مع ذاكرة تخزين مؤقت ========== //
const DICTIONARY = {
  "فندقة": {
    variations: ["الفندقة", "فندقي", "فندق", "فندقه", "فندكة"],
    answer: "لهجة منتشرة في مديرية عتمة",
    examples: ["هالكلام فندقة", "ما فهمت الفندقة دي"],
    lastUsed: null
  },
  // ... (بقية الكلمات بنفس الهيكل المحسن)
};

const dictionaryCache = new Map();

// ========== نظام متقدم لمنع التكرار ========== //
const userCooldown = new Map();
const COOLDOWN_TIME = process.env.COOLDOWN_TIME || 5000;

function checkCooldown(chatId) {
  const now = Date.now();
  const lastRequest = userCooldown.get(chatId) || 0;
  const remainingTime = COOLDOWN_TIME - (now - lastRequest);

  if (remainingTime > 0) {
    return remainingTime;
  }
  
  userCooldown.set(chatId, now);
  return 0;
}

// ========== دالة الذكاء الاصطناعي المحسنة مع التخزين المؤقت ========== //
const aiResponseCache = new Map();
const AI_CACHE_TTL = 60000; // 1 دقيقة

async function getAIResponse(prompt, chatId) {
  try {
    // التحقق من التخزين المؤقت أولاً
    const cacheKey = `${chatId}:${prompt}`;
    const cachedResponse = aiResponseCache.get(cacheKey);
    
    if (cachedResponse && (Date.now() - cachedResponse.timestamp < AI_CACHE_TTL)) {
      log(`Using cached response for chat ${chatId}`, 'debug');
      return cachedResponse.response;
    }

    if (prompt.length > 1000) {
      log(`Message too long from chat ${chatId}`, 'warn');
      return "⚠️ الرسالة طويلة جداً، يرجى اختصارها إلى أقل من 1000 حرف";
    }

    const model = genAI.getGenerativeAI({ 
      model: "gemini-pro",
      generationConfig: {
        maxOutputTokens: 200,
        temperature: 0.7,
        topP: 0.9
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" }
      ]
    });

    const result = await model.generateContent({
      contents: [{
        parts: [{
          text: `أنت بوت متخصص في لهجة عتمة اليمنية. أجب بطريقة واضحة ومختصرة ودقيقة.
المستخدم يسأل: ${prompt}`
        }]
      }]
    });
    
    const response = await result.response.text();
    
    // تخزين الرد في الذاكرة المؤقتة
    aiResponseCache.set(cacheKey, {
      response,
      timestamp: Date.now()
    });

    log(`AI response for chat ${chatId}: ${response.substring(0, 50)}...`);
    return response;
  } catch (error) {
    log(`AI error for chat ${chatId}: ${error.message}`, 'error');
    return "⚠️ حدث خطأ في المعالجة، يرجى المحاولة لاحقاً";
  }
}

// ========== نظام الأوامر المحسن ========== //
const commands = {
  start: {
    pattern: /\/start/,
    handler: (msg) => {
      const chatId = msg.chat.id;
      const welcomeMessage = `
🏮 <b>مرحباً ببوت كاشف الفندقة!</b>
✍️ اكتب أي كلمة من لهجة عتمة لمعرفة معناها

🔍 <b>الكلمات المتاحة:</b>
${Object.keys(DICTIONARY).map(word => `- <code>${word}</code>`).join('\n')}

🧠 يمكنك أيضًا سؤال البوت عن أي شيء وسيحاول المساعدة!

📝 <i>لرؤية جميع الأوامر المتاحة، اكتب /help</i>
      `;
      bot.sendMessage(chatId, welcomeMessage, { parse_mode: "HTML" });
    }
  },
  help: {
    pattern: /\/help/,
    handler: (msg) => {
      const chatId = msg.chat.id;
      const helpMessage = `
🛠 <b>أوامر البوت:</b>

/start - بدء استخدام البوت
/help - عرض هذه الرسالة
/words - عرض جميع الكلمات المتاحة في القاموس
/about - معلومات عن البوت

📝 <i>يمكنك أيضًا كتابة أي كلمة أو سؤال مباشرة</i>
      `;
      bot.sendMessage(chatId, helpMessage, { parse_mode: "HTML" });
    }
  },
  words: {
    pattern: /\/words/,
    handler: (msg) => {
      const chatId = msg.chat.id;
      const wordsList = Object.keys(DICTIONARY)
        .map(word => `- <code>${word}</code>`)
        .join('\n');
      
      bot.sendMessage(chatId, 
        `📚 <b>الكلمات المتاحة في القاموس:</b>\n\n${wordsList}\n\n` +
        `✍️ اكتب أي كلمة لمعرفة معناها`,
        { parse_mode: "HTML" }
      );
    }
  },
  about: {
    pattern: /\/about/,
    handler: (msg) => {
      const chatId = msg.chat.id;
      bot.sendMessage(chatId,
        "🤖 <b>بوت كاشف الفندقة</b>\n\n" +
        "هذا البوت مخصص لشرح كلمات ومصطلحات لهجة عتمة اليمنية.\n\n" +
        "📅 الإصدار: 2.0\n" +
        "⚙️ المطور: فريق عتمة التقني\n\n" +
        "💡 للمساعدة أو الاقتراحات، تواصل مع الدعم الفني",
        { parse_mode: "HTML" }
      );
    }
  }
};

// تسجيل جميع الأوامر
Object.values(commands).forEach(cmd => {
  bot.onText(cmd.pattern, cmd.handler);
});

// ========== معالجة الرسائل المحسنة ========== //
bot.on('message', async (msg) => {
  try {
    // تجاهل الرسائل غير النصية والقديمة
    if (!msg.text || msg.date < Date.now() / 1000 - 60) return;
    
    const chatId = msg.chat.id;
    const userMessage = msg.text.trim();

    log(`Message from ${chatId}: ${userMessage}`);

    // التحقق من التكرار
    const remainingTime = checkCooldown(chatId);
    if (remainingTime > 0) {
      return await bot.sendMessage(chatId, `⏳ يرجى الانتظار ${Math.ceil(remainingTime/1000)} ثانية قبل إرسال رسالة جديدة`);
    }

    // تجاهل الأوامر التي تم معالجتها بالفعل
    if (msg.text.startsWith('/')) return;

    // البحث في القاموس أولاً
    const localAnswer = findAnswer(userMessage);
    if (localAnswer) {
      await bot.sendMessage(chatId, localAnswer);
      return;
    }

    // الذكاء الاصطناعي إذا لم يوجد رد محلي
    const aiResponse = await getAIResponse(userMessage, chatId);
    await bot.sendMessage(chatId, aiResponse);

  } catch (error) {
    log(`Error processing message: ${error.message}`, 'error');
    try {
      await bot.sendMessage(msg.chat.id, "⚠️ حدث خطأ غير متوقع، يرجى المحاولة لاحقاً");
    } catch (e) {
      log(`Failed to send error message: ${e.message}`, 'error');
    }
  }
});

// ========== دالة البحث في القاموس المحسنة مع التخزين المؤقت ========== //
function findAnswer(query) {
  if (!query || typeof query !== 'string') return null;

  const cleanQuery = query.toLowerCase()
    .replace(/[أإآءئؤ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();

  // التحقق من التخزين المؤقت أولاً
  const cachedAnswer = dictionaryCache.get(cleanQuery);
  if (cachedAnswer) return cachedAnswer;

  for (const [word, data] of Object.entries(DICTIONARY)) {
    const allForms = [word.toLowerCase(), ...data.variations.map(v => v.toLowerCase())];
    const normalizedForms = allForms.map(form => 
      form.replace(/[أإآءئؤ]/g, 'ا')
          .replace(/[ة]/g, 'ه')
          .replace(/[ىي]/g, 'ي')
          .replace(/\s+/g, ' ')
    );
    
    if (normalizedForms.some(form => form === cleanQuery || cleanQuery.includes(form))) {
      let response = data.answer;
      if (data.examples && data.examples.length > 0) {
        response += `\n\n🔹 أمثلة:\n${data.examples.map(ex => `- "${ex}"`).join('\n')}`;
      }
      
      // تخزين النتيجة في الذاكرة المؤقتة
      dictionaryCache.set(cleanQuery, response);
      return response;
    }
  }
  
  return null;
}

// ========== تشغيل الخادم مع معالجة الأخطاء ========== //
setupWebhook()
  .then(() => {
    app.listen(PORT, () => {
      log(`✅ Server running on port ${PORT}`);
      log(`🌐 Webhook URL: ${webhookUrl}`);
      log("⚡ Bot is ready to handle messages");
    });
  })
  .catch(error => {
    log(`Failed to start server: ${error.message}`, 'error');
    process.exit(1);
  });

// ========== معالجة إغلاق التطبيق بشكل أنيق ========== //
process.on('SIGINT', () => {
  log('🛑 Shutting down gracefully...');
  
  // إغلاق مسجلات الملفات
  logStream.end();
  requestLogStream.end();
  
  // إغلاق الخادم
  server.close(() => {
    process.exit(0);
  });
});

// معالجة الأخطاء غير الملتقطة
process.on('unhandledRejection', (error) => {
  log(`Unhandled Rejection: ${error.message}`, 'error');
});

process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}`, 'error');
  process.exit(1);
});
