const path = require("path");
const { Telegraf } = require("telegraf");
const config = require("./config");
const { JsonDb } = require("./utils/jsonDb");
const { createModerationModule } = require("./modules/moderation");
const { createAdminModule } = require("./modules/admin");
const { createSubscriptionModule } = require("./modules/subscription");
const { startAutopost } = require("./modules/autopost");

const bot = new Telegraf(config.TOKEN);

const mutesDb = new JsonDb(path.join(__dirname, "data", "mutes.json"), {});
const bansDb = new JsonDb(path.join(__dirname, "data", "bans.json"), {});
const settingsDb = new JsonDb(path.join(__dirname, "data", "settings.json"), {
  requiredChannelLink: config.REQUIRED_CHANNEL_LINK,
  forceSubscription: true,
  adminIds: []
});

const moderation = createModerationModule(bot, config, mutesDb, bansDb);
const admin = createAdminModule(bot, config, settingsDb, mutesDb, bansDb);
const subscription = createSubscriptionModule(bot, config, settingsDb);


bot.catch((err, ctx) => {
  console.error("[BOT ERROR]", err);
  if (ctx?.updateType) {
    console.error("[BOT UPDATE TYPE]", ctx.updateType);
  }
});

bot.command("stat", async (ctx) => {
  const start = Date.now();

  const sent = await ctx.reply("⏳ Проверяю статус...");
  const ping = Date.now() - start;

  await ctx.telegram.editMessageText(
    ctx.chat.id,
    sent.message_id,
    undefined,
    `✅ <b>Бот работает</b>\n\n` +
      `🏓 Пинг: <b>${ping} мс</b>\n` +
      `🕒 Время: <b>${new Date().toLocaleString("ru-RU")}</b>`,
    { parse_mode: "HTML" }
  );
});

bot.command("admin", admin.handleAdminCommand);
bot.action(/^admin_/, admin.handleAdminAction);

bot.command("mute", moderation.handleMute);
bot.command("unmute", moderation.handleUnmute);
bot.command("ban", moderation.handleBan);
bot.command("unban", moderation.handleUnban);

bot.on("new_chat_members", subscription.onUserJoin);

bot.on("document", async (ctx, next) => {
  if (ctx.chat?.type === "private") {
    await admin.handlePrivateDocument(ctx);
  }
  return next();
});

bot.on("text", async (ctx, next) => {
  if (ctx.chat?.type === "private") {
    await admin.handlePrivateText(ctx);
  }
  return next();
});

bot.on("message", async (ctx, next) => {
  const text = ctx.message?.text || "";

  if (text.startsWith("/")) {
    return next();
  }

  await subscription.deleteIfNotSubscribed(ctx);
  return next();
});

async function start() {
  try {
    await moderation.restoreMutes();
    startAutopost(bot, config);

    await bot.launch({
  dropPendingUpdates: true
});
    console.log("Бот запущен");
  } catch (e) {
    console.error("Ошибка запуска:", e);
  }
}

start();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));