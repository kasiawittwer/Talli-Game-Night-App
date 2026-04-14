/**
 * Merges env into `extra` so web can use the optional API (GameRules proxy + OpenAI proxy)
 * without editing committed app.json. Copy `.env.example` to `.env` and set URLs locally.
 */
const appJson = require('./app.json');

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      ...(appJson.expo.extra || {}),
      OPENAI_API_KEY:
        process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? appJson.expo.extra?.OPENAI_API_KEY ?? '',
      GAME_ASSISTANT_API_URL:
        process.env.EXPO_PUBLIC_GAME_ASSISTANT_API_URL ?? appJson.expo.extra?.GAME_ASSISTANT_API_URL ?? '',
    },
  },
};
