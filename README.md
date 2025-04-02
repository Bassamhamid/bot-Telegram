
const CACHE = CacheService.getScriptCache();

// قاموس متكامل بجميع الكلمات
const DICTIONARY = {
  "فندقة": {
    variations: ["الفندقة", "فندقي", "فندق"],
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
    variations: ["اسايعه", "أسايعة", "اسايعة", "اسيع", "أسيع", "اسايع", "أسايع"],
    answer: "نساء أو إناث"
  },
  "ادمخ": {
    variations: ["أدمخ", "دمخ", "أدموخ", "ادموخ"],
    answer: "معناها اذهب"
  },
  "معكال": {
    variations: ["معكالة", "معكالو", "معكالي", "مكعال"],
    answer: "كلمة خادشة للحياء"
  },
  "قطني": {
    variations: ["قطنطجي", "قطنوج", "قطنط", "قطن"],
    answer: "ولد صغير"
  },
  "قطنية": {
    variations: ["قطنيه", "قطنيات"],
    answer: "بنت صغيرة"
  },
  "قطانية": {
    variations: ["قطانيات", "قطاني", "قطنيات"],
    answer: "أولاد أو بنات (جمع)"
  },
  "دمح": {
    variations: ["دماحي", "دماح", "دمحا", "دماحو"],
    answer: "ألف أو مليون (حسب السياق)"
  },
  "شنحامة": {
    variations: ["شنحامه", "شنحام", "شنحمه", "شنحامي"],
    answer: "مئة أو مئة ألف (حسب السياق)"
  },
  "شنحام": {
    variations: ["شنحامي", "شنحمو", "شنحامو"],
    answer: "رجل كبير في السن"
  },
  "شنحمة": {
    variations: ["شنحمه", "شنحم", "شنحما", "شنحمات"],
    answer: "امرأة عجوز"
  },
  "مجبر": {
    variations: ["مجبار", "مجابرة", "مجبره", "مجبرو"],
    answer: "رجل"
  },
  "مجبر حمس": {
    variations: ["مجبرحمس", "مجبر حمسي", "حمس مجبر", "مجبر حمسo"],
    answer: "رجل مميز أو رائع"
  },
  "حمس": {
    variations: ["حماس", "حمسي", "حمسو", "حميس"],
    answer: "جيد جداً أو ممتاز"
  },
  "اكلح": {
    variations: ["كلح", "اكلحي", "اكلحو", "كلاح"],
    answer: "اغرب أو اذهب بعيداً"
  },
  "كلح": {
    variations: ["كلاح", "كلحو", "كلحي", "كلحا"],
    answer: "ذهب أو رحل"
  },
  "مجابرة": {
    variations: ["مجابر", "مجابرو", "مجابri", "مجابرات"],
    answer: "رجال (جمع)"
  }
};

function doPost(e) {
  try {
    const update = JSON.parse(e.postData.contents);
    const message = update.message || update.edited_message;
    if (!message?.text) return ContentService.createTextOutput("OK");
    
    const chatId = message.chat.id;
    const text = message.text.trim();
    const userId = message.from.id;

    // منع التكرار (30 ثانية)
    const cacheKey = `last_${userId}_${text.toLowerCase()}`;
    if (CACHE.get(cacheKey)) return ContentService.createTextOutput("OK");
    CACHE.put(cacheKey, '1', 30);

    // معالجة الأوامر
    if (text === '/start') {
      sendMessage(chatId, 
        "🏮 <b>مرحباً ببوت كاشف الفندقة!</b>\n" +
        "✍️ اكتب أي كلمة من لهجة عتمة لمعرفة معناها\n\n" +
        "🔍 أمثلة: <code>شنحامة</code> - <code>قطنية</code> - <code>مجبر حمس</code>");
      return ContentService.createTextOutput("OK");
    }

    // البحث عن الإجابة
    const answer = findAnswer(text) || 
      "⚠️ لم يتم العثور على الكلمة في القاموس\n" +
      "يمكنك اقتراح إضافتها عبر مراسلة المطور";
    
    sendMessage(chatId, answer);

  } catch (error) {
    Logger.log('Error: ' + error);
  }
  return ContentService.createTextOutput("OK");
}

function findAnswer(query) {
  const cleanQuery = query.toLowerCase()
    .replace(/[أإآء]/g, 'ا')
    .replace(/[ة]/g, 'ه')
    .replace(/[ى]/g, 'ي');
  
  for (const [word, data] of Object.entries(DICTIONARY)) {
    const allForms = [word.toLowerCase(), ...data.variations.map(v => v.toLowerCase())];
    const normalizedForms = allForms.map(form => 
      form.replace(/[أإآء]/g, 'ا')
          .replace(/[ة]/g, 'ه')
          .replace(/[ى]/g, 'ي')
    );
    
    if (normalizedForms.includes(cleanQuery)) {
      return data.answer;
    }
  }
  return null;
}

function sendMessage(chatId, text) {
  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    };
    
    const options = {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };
    
    UrlFetchApp.fetch(url, options);
  } catch (e) {
    Logger.log('Error sending message: ' + e);
  }
}
