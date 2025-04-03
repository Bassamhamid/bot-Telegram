module.exports = {
  botSettings: {
    token: process.env.TELEGRAM_TOKEN,
    webhook: process.env.WEBHOOK_URL,
    geminiKey: process.env.GEMINI_API_KEY,
    webhookSecret: process.env.WEBHOOK_SECRET
  },
  dictionarySettings: {
    cacheTimeout: parseInt(process.env.CACHE_TIMEOUT) || 30
  },
  serverSettings: {
    port: parseInt(process.env.PORT) || 3000,
    hostname: process.env.RENDER_EXTERNAL_HOSTNAME || 'localhost'
  }
};
