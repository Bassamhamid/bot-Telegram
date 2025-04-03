require('dotenv').config();
const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const app = express();
const PORT = process.env.PORT || 3000;

// ========== التحقق من المتغيرات البيئية ========== //
const requiredEnvVars = ['TELEGRAM_TOKEN', 'GEMINI_API_KEY'];
requiredEnvVars.forEach(varName => {
  if (!process.env[varName]) {
    console.error(`❌ Error: Missing ${varName} environment variable`);
    process.exit(1);
  }
});

// ========== تهيئة البوت وGemini ========== //
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
app.use(express.json());

// ========== إعداد Webhook ========== //
const webhookUrl = process.env.WEBHOOK_URL || `https://${process.env.RENDER_EXTERNAL_HOSTNAME || 'my-telegram-bot-8zl0.onrender.com'}/webhook`;
bot.setWebHook(webhookUrl);

// ========== معالجة Webhook ========== //
app.post('/webhook', (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

// ========== قاموس الكلمات ========== //
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

// ========== دالة الذكاء الاصطناعي ========== //
async function getAIResponse(prompt) {
  try {
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
    
    return result.response.text();
  } catch (error) {
    console.error("Error with Gemini:", error);
    return "⚠️ حدث خطأ في المعالجة، حاول مرة أخرى";
  }
}

// ========== معالجة الأوامر ========== //
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 
    "🏮 <b>مرحباً ببوت كاشف الفندقة!</b>\n" +
    "✍️ اكتب أي كلمة من لهجة عتمة لمعرفة معناها\n\n" +
    "🔍 أمثلة: <code>فندقة</code> - <code>شلالة</code> - <code>مجبر حمس</code>\n\n" +
    "🧠 يمكنك أيضًا سؤال البوت عن أي شيء وسيحاول المساعدة!",
    { parse_mode: "HTML" });
});

// ========== معالجة الرسائل ========== //
bot.on('message', async (msg) => {
  try {
    if (!msg.text) return;
    
    const chatId = msg.chat.id;
    const userMessage = msg.text.trim();

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
    await bot.sendMessage(msg.chat.id, "⚠️ حدث خطأ في المعالجة، حاول مرة أخرى");
  }
});

// ========== دالة البحث في القاموس ========== //
function findAnswer(query) {
  const cleanQuery = query.toLowerCase()
    .replace(/[أإآءئؤ]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .trim();

  for (const [word, data] of Object.entries(DICTIONARY)) {
    const allForms = [word.toLowerCase(), ...data.variations.map(v => v.toLowerCase())];
    const normalizedForms = allForms.map(form => 
      form.replace(/[أإآءئؤ]/g, 'ا')
          .replace(/[ة]/g, 'ه')
          .replace(/[ىي]/g, 'ي')
    );
    
    if (normalizedForms.includes(cleanQuery)) {
      return data.answer;
    }
  }
  return null;
}

// ========== تشغيل الخادم ========== //
app.listen(PORT, () => {
  console.log(`✅ البوت يعمل على المنفذ ${PORT}`);
  console.log(`🌐 Webhook URL: ${webhookUrl}`);
  console.log("⚡ Bot is ready to handle messages");
});
