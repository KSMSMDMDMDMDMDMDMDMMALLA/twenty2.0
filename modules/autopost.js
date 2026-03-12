function startAutopost(bot, config) {
  const { TARGET_CHAT_ID, AUTOPOST_INTERVAL, AUTOPOST_MESSAGES } = config;

  console.log(`[AUTOPOST] Запущен. Интервал: ${AUTOPOST_INTERVAL} сек.`);

  setInterval(async () => {
    try {
      const text =
        AUTOPOST_MESSAGES[Math.floor(Math.random() * AUTOPOST_MESSAGES.length)];

      await bot.telegram.sendMessage(TARGET_CHAT_ID, text, {
        parse_mode: "HTML"
      });

      console.log(`[AUTOPOST] Сообщение отправлено в чат ${TARGET_CHAT_ID}`);
    } catch (e) {
      console.error("[AUTOPOST] Ошибка:", e.message);
    }
  }, AUTOPOST_INTERVAL * 3500);
}

module.exports = { startAutopost };