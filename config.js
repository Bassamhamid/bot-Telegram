module.exports = {
  botSettings: {
    token: process.env.TELEGRAM_TOKEN,
    webhook: process.env.WEBHOOK_URL,
    geminiKey: process.env.GEMINI_API_KEY
  },
  dictionarySettings: {
    cacheTimeout: process.env.CACHE_TIMEOUT || 30 // ثانية
  }
};
