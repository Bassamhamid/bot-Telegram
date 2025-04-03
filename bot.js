require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
const PORT = process.env.PORT || 3000;

// ========== التحقق من المتغيرات البيئية ========== //
const requiredEnvVars = ['TELEGRAM_TOKEN', 'GEMINI_API_KEY', 'WEBHOOK_SECRET'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ Error: Missing ${varName} environment variable`);
    process.exit(1);
  }
});

// ========== تهيئة البوت وGemini ========== //
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: false });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.use(express.json());

// ========== إعداد Webhook مع التحقق من الأمان ========== //
const webhookUrl = process.env.WEBHOOK_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME}/webhook`;
bot.setWebHook(webhookUrl);

// ========== معالجة Webhook مع التحقق من السرية ========== //
app.post('/webhook', (req, res) => {
  if (req.query.secret !== process.env.WEBHOOK_SECRET) {
    console.warn('⚠️ محاولة وصول غير مصرح بها إلى Webhook');
    return res.sendStatus(403);
  }
  
  try {
    bot.processUpdate(req.body);
    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.sendStatus(500);
  }
});

// ========== قاموس الكلمات مع تحسينات البحث ========== //
const DICTIONARY = {
  "فندقة": {
    variations: ["الفندقة", "فندقي", "فندق", "فندقه", "فندكة"],
    answer: "لهجة منتشرة في مديرية عتمة"
  },
  "ساهف": {
    variations: ["ساهفة", "سحفة", "سحيف", "سحف"],
    answer: "شخص سيء الخلق"
  },
  "شلالة": {
    variations: ["شله", "شلا", "شل", "شلاه"],
    answer: "النقود أو المال"
  },
  "أسايعه": {
    variations: ["اسايعه", "أسايعة", "اسايعة", "اسيع", "أسيع"],
    answer: "نساء أو إناث"
  },
  "ادمخ": {
    variations: ["أدمخ", "دمخ", "أدموخ", "ادموخ"],
    answer: "معناها اذهب"
  },
  "معكال": {
    variations: ["معكالة", "معكالو", "معكالي"],
    answer: "كلمة خادشة للحياء"
  },
  "مجبر حمس": {
    variations: ["مجبرحمس", "مجبر حمسي", "حمس مجبر", "مجبر حمسو"],
    answer: "رجل مميز أو رائع"
  },
  "صانم": {
    variations: ["صانمة", "صانمي", "صانمو"],
    answer: "أخ (مذكر)"
  },
  "صانمة": {
    variations: ["صانمه", "صانمات", "صانمي"],
    answer: "أخت (مؤنث)"
  },
  "قفاش": {
    variations: ["قفاشي", "قفاشو", "قفش", "قفشة"],
    answer: "سارق (مذكر)"
  },
  "قفاشة": {
    variations: ["قفاشه", "قفشات", "قافشة"],
    answer: "سارقة (مؤنث)"
  },
  "مجابرة": {
    variations: ["مجابر", "مجابرو", "مجابري", "مجابرات"],
    answer: "جماعة من الرجال (جمع)"
  },
  "معكاز": {
    variations: ["معكازي", "معكازة", "معاكيز", "معكوز"],
    answer: "يد 🖐 (أداة للإمساك أو الإشارة)"
  },
  "شنحام": {
    variations: ["شنحامي", "شناحيم", "شنحوم"],
    answer: "رجل كبير في السن"
  }
};

// ========== دالة الذكاء الاصطناعي مع تحسينات الأمان ========== //
async function getAIResponse(prompt) {
  try {
    // التحقق من طول الرسالة
    if (prompt.length > 1000) {
      return "⚠️ الرسالة طويلة جداً، يرجى اختصارها إلى أقل من 1000 حرف";
    }

    const model = genAI.getGenerativeModel({ 
      model: "gemini-pro",
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.7
      }
    });

    const result = await model.generateContent({
      contents: [{
        parts: [{
          text: `أنت بوت متخصص في لهجة عتمة اليمنية. أجب بطريقة واضحة ومختصرة.
السؤال: ${prompt}`
        }]
      }]
    });
    
    return result.response.text() || "لم أتمكن من فهم السؤال، يرجى إعادة صياغته";
  } catch (error) {
    console.error("Error with Gemini:", error);
    return "⚠️ حدث خطأ في المعالجة، حاول مرة أخرى لاحقاً";
  }
}

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

// ========== معالجة الأوامر ========== //
bot.onText(/\/start/, (msg) => {
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
});

bot.onText(/\/help/, (msg) => {
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
});

bot.onText(/\/words/, (msg) => {
  const chatId = msg.chat.id;
  const wordsList = Object.keys(DICTIONARY)
    .map(word => `- <code>${word}</code>`)
    .join('\n');
  
  bot.sendMessage(chatId, 
    `📚 <b>الكلمات المتاحة في القاموس:</b>\n\n${wordsList}\n\n` +
    `✍️ اكتب أي كلمة لمعرفة معناها`,
    { parse_mode: "HTML" }
  );
});

bot.onText(/\/about/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId,
    "🤖 <b>بوت كاشف الفندقة</b>\n\n" +
    "هذا البوت مخصص لشرح كلمات ومصطلحات لهجة عتمة اليمنية.\n\n" +
    "📅 الإصدار: 2.0\n" +
    "⚙️ المطور: فريق عتمة التقني\n\n" +
    "💡 للمساعدة أو الاقتراحات، تواصل مع الدعم الفني",
    { parse_mode: "HTML" }
  );
});

// ========== معالجة الرسائل مع تحسينات الأمان ========== //
bot.on('message', async (msg) => {
  try {
    // تجاهل الرسائل غير النصية والرسائل القديمة
    if (!msg.text || msg.date < Date.now() / 1000 - 60) return;
    
    const chatId = msg.chat.id;
    const userMessage = msg.text.trim();

    // التحقق من التكرار
    if (checkCooldown(chatId)) {
      return await bot.sendMessage(chatId, "⏳ يرجى الانتظار قليلاً قبل إرسال رسالة جديدة");
    }

    // تجاهل الأوامر التي تم معالجتها بالفعل
    if (msg.text.startsWith('/')) return;

    // 1. البحث في القاموس أولاً
    const localAnswer = findAnswer(userMessage);
    if (localAnswer) {
      return await bot.sendMessage(chatId, localAnswer);
    }

    // 2. الذكاء الاصطناعي إذا لم يوجد رد محلي
    const aiResponse = await getAIResponse(userMessage);
    await bot.sendMessage(chatId, aiResponse);

  } catch (error) {
    console.error("Error processing message:", error);
    try {
      await bot.sendMessage(msg.chat.id, "⚠️ حدث خطأ غير متوقع، يرجى المحاولة لاحقاً");
    } catch (e) {
      console.error("Failed to send error message:", e);
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
      return data.answer;
    }
  }
  return null;
}

// ========== تشغيل الخادم مع معالجة الأخطاء ========== //
app.listen(PORT, () => {
  console.log(`✅ البوت يعمل على المنفذ ${PORT}`);
  console.log(`🌐 Webhook URL: ${webhookUrl}`);
  console.log("⚡ Bot is ready to handle messages");
});

process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});
