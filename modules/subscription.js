const { Markup } = require("telegraf");
const { isAdmin, htmlEscape } = require("../utils/helpers");

function createSubscriptionModule(bot, config, settingsDb) {
  const { REQUIRED_CHANNEL_ID, ADMIN_IDS } = config;

  function getRequiredLink() {
    settingsDb.reload();
    return settingsDb.data.requiredChannelLink || config.REQUIRED_CHANNEL_LINK;
  }

  function isForceSubscriptionEnabled() {
    settingsDb.reload();
    return settingsDb.data.forceSubscription !== false;
  }

  function subscriptionKeyboard() {
    return Markup.inlineKeyboard([
      [Markup.button.url("🔔 Подписаться", getRequiredLink())]
    ]);
  }

  async function isSubscribed(userId) {
    try {
      const member = await bot.telegram.getChatMember(REQUIRED_CHANNEL_ID, userId);
      const status = member.status;

      if (
        status === "member" ||
        status === "administrator" ||
        status === "creator" ||
        status === "restricted"
      ) {
        return true;
      }

      if (status === "left" || status === "kicked") {
        return false;
      }

      return false;
    } catch (e) {
      console.error(`[SUB] Ошибка проверки подписки user_id=${userId}:`, e.message);
      return null;
    }
  }

  async function deleteIfNotSubscribed(ctx) {
    if (!ctx.chat || !ctx.from) return false;
    if (!["group", "supergroup"].includes(ctx.chat.type)) return false;
    if (isAdmin(ctx.from.id, ADMIN_IDS)) return false;
    if (!isForceSubscriptionEnabled()) return false;

    const subStatus = await isSubscribed(ctx.from.id);

    if (subStatus === true) return false;
    if (subStatus === null) {
      console.warn(`[SUB] Не удалось проверить подписку для ${ctx.from.id}`);
      return false;
    }

    try {
      await ctx.deleteMessage();

      await ctx.reply(
        `⚠️ <b>Сообщение удалено</b>\n\n` +
          `👤 <b>${htmlEscape(ctx.from.first_name || "Пользователь")}</b>, у вас нет обязательной подписки.\n` +
          `Чтобы получить доступ к общению, подпишитесь на обязательный чат по кнопке ниже.\n\n` +
          `✨ После подписки вы сможете писать сообщения без ограничений.`,
        {
          parse_mode: "HTML",
          disable_web_page_preview: true,
          ...subscriptionKeyboard()
        }
      );

      console.log(`[SUB] Сообщение пользователя ${ctx.from.id} удалено`);
      return true;
    } catch (e) {
      console.error(`[SUB] Ошибка удаления сообщения ${ctx.from.id}:`, e.message);
      return false;
    }
  }

  async function onUserJoin(ctx) {
    if (!ctx.message?.new_chat_members?.length) return;
    if (!isForceSubscriptionEnabled()) return;

    for (const user of ctx.message.new_chat_members) {
      if (user.is_bot) continue;

      const subStatus = await isSubscribed(user.id);

      if (subStatus === false) {
        await ctx.reply(
          `⚠️ <b>${htmlEscape(user.first_name || "Пользователь")}</b>, для общения в чате нужна обязательная подписка.\n\n` +
            `Подпишитесь на обязательный чат по кнопке ниже, после этого вы сможете писать сообщения в группе.`,
          {
            parse_mode: "HTML",
            disable_web_page_preview: true,
            ...subscriptionKeyboard()
          }
        );
      }
    }
  }

  return {
    getRequiredLink,
    subscriptionKeyboard,
    isForceSubscriptionEnabled,
    isSubscribed,
    deleteIfNotSubscribed,
    onUserJoin
  };
}

module.exports = { createSubscriptionModule };