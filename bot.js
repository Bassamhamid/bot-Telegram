require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// ========== إعداد نظام التسجيل (Logging) ========== //
const logStream = fs.createWriteStream(path.join(__dirname, 'bot.log'), { flags: 'a' });

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  logStream.write(logMessage);
  console[level](logMessage);
}

// ========== التحقق من المتغيرات البيئية ========== //
const requiredEnvVars = [
  'TELEGRAM_TOKEN',
  'GEMINI_API_KEY',
  'WEBHOOK_SECRET',
  'RENDER_EXTERNAL_HOSTNAME'
];

requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    log(`Missing ${varName} environment variable`, 'error');
    process.exit(1);
  }
});

// ========== تهيئة البوت وGemini ========== //
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {
  polling: false,
  onlyFirstMatch: true
});

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.use(express.json());
app.use(cors());

// ========== إعداد Webhook ========== //
const webhookUrl = process.env.WEBHOOK_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/webhook`;

async function setupWebhook() {
  try {
    await bot.setWebHook(webhookUrl, {
      secret_token: process.env.WEBHOOK_SECRET,
      max_connections: 40
    });
    log(`✅ Webhook configured successfully at: ${webhookUrl}`);
  } catch (error) {
    log(`❌ Failed to set webhook: ${error.message}`, 'error');
    process.exit(1);
  }
}

// ========== معالجة Webhook مع التحقق من الأمان ========== //
app.post('/webhook', (req, res) => {
  if (req.query.secret !== process.env.WEBHOOK_SECRET) {
    log(`Unauthorized webhook access attempt from IP: ${req.ip}`, 'warn');
    return res.sendStatus(403);
  }
  
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ========== نقطة فحص الصحة (Health Check) ========== //
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ========== قاموس الكلمات المحسن ========== //
const DICTIONARY = {
  "فندقة": {
    variations: ["الفندقة", "فندقي", "فندق", "فندقه", "فندكة"],
    answer: "لهجة منتشرة في مديرية عتمة",
    examples: ["هالكلام فندقة", "ما فهمت الفندقة دي"]
  },
  // ... (بقية الكلمات بنفس الهيكل المحسن)
};

// ========== نظام منع التكرار ========== //
const userCooldown = new Map();
const COOLDOWN_TIME = 5000; // 5 ثواني

function checkCooldown(chatId) {
  if (userCooldown.has(chatId)) {
    const lastTime = userCooldown.get(chatId);
    if (Date.now() - lastTime < COOLDOWN_TIME) {
      return true;
    }
  }
  userCooldown.set(chatId, Date.now());
  return false;
}

// ========== دالة الذكاء الاصطناعي المحسنة ========== //
async function getAIResponse(prompt, chatId) {
  try {
    if (prompt.length > 1000) {
      log(`Message too long from chat ${chatId}`, 'warn');
      return "⚠️ الرسالة طويلة جداً، يرجى اختصارها إلى أقل من 1000 حرف";
    }

    const model = genAI.getGenerativeModel({ 
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
    log(`AI response for chat ${chatId}: ${response.substring(0, 50)}...`);
    return response;
  } catch (error) {
    log(`AI error for chat ${chatId}: ${error.message}`, 'error');
    return "⚠️ حدث خطأ في المعالجة، يرجى المحاولة لاحقاً";
  }
}

// ========== معالجة الأوامر ========== //
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
  // ... (بقية الأوامر)
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
    if (checkCooldown(chatId)) {
      return await bot.sendMessage(chatId, "⏳ يرجى الانتظار قليلاً قبل إرسال رسالة جديدة");
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

// ========== دالة البحث في القاموس المحسنة ========== //
function findAnswer(query) {
  if (!query || typeof query !== 'string') return null;

  const cleanQuery = query.toLowerCase()
    .replace(/[أإآءئؤ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/\s+/g, ' ')
    .trim();

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
      return response;
    }
  }
  return null;
}

// ========== تشغيل الخادم ========== //
setupWebhook().then(() => {
  app.listen(PORT, () => {
    log(`✅ Server running on port ${PORT}`);
    log(`🌐 Webhook URL: ${webhookUrl}`);
    log("⚡ Bot is ready to handle messages");
  });
});

// معالجة إغلاق التطبيق بشكل أنيق
process.on('SIGINT', () => {
  log('Shutting down gracefully...');
  logStream.end(() => process.exit(0));
});

process.on('unhandledRejection', (error) => {
  log(`Unhandled Rejection: ${error.message}`, 'error');
});

process.on('uncaughtException', (error) => {
  log(`Uncaught Exception: ${error.message}`, 'error');
});
