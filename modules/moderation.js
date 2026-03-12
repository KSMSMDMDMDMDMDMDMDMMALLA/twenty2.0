const { Markup } = require("telegraf");
const { isAdmin, formatDuration, nowTs, htmlEscape } = require("../utils/helpers");

function createModerationModule(bot, config, mutesDb, bansDb) {
  const { ADMIN_IDS } = config;

  function muteKey(chatId, userId) {
    return `${chatId}:${userId}`;
  }

  function banKey(chatId, userId) {
    return `${chatId}:${userId}`;
  }

  async function botCanRestrict(chatId) {
    try {
      const me = await bot.telegram.getMe();
      const member = await bot.telegram.getChatMember(chatId, me.id);

      if (!["administrator", "creator"].includes(member.status)) {
        return false;
      }

      return !!member.can_restrict_members || member.status === "creator";
    } catch (e) {
      console.error("[MOD] Ошибка проверки прав бота:", e.message);
      return false;
    }
  }

  function cleanupExpiredMutes() {
    mutesDb.reload();
    const now = nowTs();
    let changed = false;

    for (const [key, mute] of Object.entries(mutesDb.data)) {
      if ((mute.untilTs || 0) <= now) {
        delete mutesDb.data[key];
        changed = true;
      }
    }

    if (changed) mutesDb.save();
  }

  async function restoreMutes() {
    cleanupExpiredMutes();
    mutesDb.reload();

    for (const mute of Object.values(mutesDb.data)) {
      try {
        if ((mute.untilTs || 0) <= nowTs()) continue;

        await bot.telegram.restrictChatMember(mute.chatId, mute.userId, {
          permissions: {
            can_send_messages: false
          },
          until_date: mute.untilTs
        });

        console.log(`[MOD] Мут восстановлен: chat=${mute.chatId}, user=${mute.userId}`);
      } catch (e) {
        console.error(
          `[MOD] Не удалось восстановить мут chat=${mute.chatId}, user=${mute.userId}:`,
          e.message
        );
      }
    }
  }

  async function handleMute(ctx) {
    if (!ctx.from || !isAdmin(ctx.from.id, ADMIN_IDS)) {
      return ctx.reply("❌ У тебя нет доступа к этой команде.");
    }

    if (!ctx.chat || ctx.chat.type !== "supergroup") {
      return ctx.reply("❌ /mute работает только в супергруппе.");
    }

    if (!(await botCanRestrict(ctx.chat.id))) {
      return ctx.reply("❌ У бота нет права ограничивать участников.");
    }

    const reply = ctx.message.reply_to_message;
    if (!reply || !reply.from) {
      return ctx.reply(
        "❗ Использование:\n" +
          "Ответом на сообщение пользователя:\n" +
          "<code>/mute 3600 флуд</code>\n\n" +
          "Время указывается в секундах.",
        { parse_mode: "HTML" }
      );
    }

    if (reply.from.is_bot) {
      return ctx.reply("❌ Нельзя замутить бота.");
    }

    const text = ctx.message.text || "";
    const argsRaw = text.split(" ").slice(1).join(" ").trim();

    let duration = 3600;
    let reason = "Нарушение правил";

    if (argsRaw) {
      const parts = argsRaw.split(" ");
      const first = parseInt(parts[0], 10);

      if (!Number.isNaN(first)) {
        duration = first;
        reason = parts.slice(1).join(" ").trim() || "Нарушение правил";
      } else {
        reason = argsRaw;
      }
    }

    const untilTs = nowTs() + duration;

    try {
      await bot.telegram.restrictChatMember(ctx.chat.id, reply.from.id, {
        permissions: {
          can_send_messages: false
        },
        until_date: untilTs
      });

      mutesDb.reload();
      mutesDb.data[muteKey(ctx.chat.id, reply.from.id)] = {
        chatId: ctx.chat.id,
        userId: reply.from.id,
        adminId: ctx.from.id,
        reason,
        untilTs,
        createdAt: new Date().toISOString()
      };
      mutesDb.save();

      await ctx.reply(
        `🔇 <b>ПОЛЬЗОВАТЕЛЬ ЗАМУЧЕН</b>\n\n` +
          `👤 Пользователь: <b>${htmlEscape(reply.from.first_name || "Пользователь")}</b>\n` +
          `🆔 ID: <code>${reply.from.id}</code>\n` +
          `⏰ Длительность: <b>${formatDuration(duration)}</b>\n` +
          `📝 Причина: <b>${htmlEscape(reason)}</b>\n` +
          `👮 Администратор: <b>${htmlEscape(ctx.from.first_name || "Admin")}</b>`,
        { parse_mode: "HTML" }
      );
    } catch (e) {
      console.error("[MOD] Ошибка мута:", e.message);
      await ctx.reply(`❌ Ошибка мута:\n<code>${htmlEscape(e.message)}</code>`, {
        parse_mode: "HTML"
      });
    }
  }

  async function handleUnmute(ctx) {
    if (!ctx.from || !isAdmin(ctx.from.id, ADMIN_IDS)) {
      return ctx.reply("❌ У тебя нет доступа к этой команде.");
    }

    if (!ctx.chat || ctx.chat.type !== "supergroup") {
      return ctx.reply("❌ /unmute работает только в супергруппе.");
    }

    if (!(await botCanRestrict(ctx.chat.id))) {
      return ctx.reply("❌ У бота нет права ограничивать участников.");
    }

    const reply = ctx.message.reply_to_message;
    if (!reply || !reply.from) {
      return ctx.reply(
        "❗ Использование:\n" +
          "Ответом на сообщение пользователя:\n" +
          "<code>/unmute</code>",
        { parse_mode: "HTML" }
      );
    }

    try {
      await bot.telegram.restrictChatMember(ctx.chat.id, reply.from.id, {
        permissions: {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_invite_users: true
        }
      });

      mutesDb.reload();
      delete mutesDb.data[muteKey(ctx.chat.id, reply.from.id)];
      mutesDb.save();

      await ctx.reply(
        `✅ <b>ПОЛЬЗОВАТЕЛЬ РАЗМУЧЕН</b>\n\n` +
          `👤 Пользователь: <b>${htmlEscape(reply.from.first_name || "Пользователь")}</b>\n` +
          `🆔 ID: <code>${reply.from.id}</code>`,
        { parse_mode: "HTML" }
      );
    } catch (e) {
      console.error("[MOD] Ошибка размута:", e.message);
      await ctx.reply(`❌ Ошибка размута:\n<code>${htmlEscape(e.message)}</code>`, {
        parse_mode: "HTML"
      });
    }
  }

  async function handleBan(ctx) {
    if (!ctx.from || !isAdmin(ctx.from.id, ADMIN_IDS)) {
      return ctx.reply("❌ У тебя нет доступа к этой команде.");
    }

    if (!ctx.chat || !["group", "supergroup"].includes(ctx.chat.type)) {
      return ctx.reply("❌ Команда работает только в группе.");
    }

    if (!(await botCanRestrict(ctx.chat.id))) {
      return ctx.reply("❌ У бота нет права банить/ограничивать участников.");
    }

    const reply = ctx.message.reply_to_message;
    if (!reply || !reply.from) {
      return ctx.reply(
        "❗ Использование:\nОтветом на сообщение: <code>/ban причина</code>",
        { parse_mode: "HTML" }
      );
    }

    const text = ctx.message.text || "";
    const reason =
      text.split(" ").slice(1).join(" ").trim() || "Нарушение правил";

    try {
      await bot.telegram.banChatMember(ctx.chat.id, reply.from.id, {
        revoke_messages: true
      });

      bansDb.reload();
      bansDb.data[banKey(ctx.chat.id, reply.from.id)] = {
        chatId: ctx.chat.id,
        userId: reply.from.id,
        adminId: ctx.from.id,
        reason,
        createdAt: new Date().toISOString()
      };
      bansDb.save();

      mutesDb.reload();
      delete mutesDb.data[muteKey(ctx.chat.id, reply.from.id)];
      mutesDb.save();

      await ctx.reply(
        `🚫 <b>ПОЛЬЗОВАТЕЛЬ ЗАБАНЕН</b>\n\n` +
          `👤 Пользователь: <b>${htmlEscape(reply.from.first_name || "Пользователь")}</b>\n` +
          `🆔 ID: <code>${reply.from.id}</code>\n` +
          `📝 Причина: <b>${htmlEscape(reason)}</b>\n` +
          `👮 Администратор: <b>${htmlEscape(ctx.from.first_name || "Admin")}</b>`,
        { parse_mode: "HTML" }
      );
    } catch (e) {
      console.error("[MOD] Ошибка бана:", e.message);
      await ctx.reply(`❌ Ошибка бана:\n<code>${htmlEscape(e.message)}</code>`, {
        parse_mode: "HTML"
      });
    }
  }

  async function handleUnban(ctx) {
    if (!ctx.from || !isAdmin(ctx.from.id, ADMIN_IDS)) {
      return ctx.reply("❌ У тебя нет доступа к этой команде.");
    }

    if (!ctx.chat || !["group", "supergroup"].includes(ctx.chat.type)) {
      return ctx.reply("❌ Команда работает только в группе.");
    }

    if (!(await botCanRestrict(ctx.chat.id))) {
      return ctx.reply("❌ У бота нет права банить/ограничивать участников.");
    }

    const text = ctx.message.text || "";
    const args = text.split(" ").slice(1).join(" ").trim();

    if (!args || Number.isNaN(Number(args))) {
      return ctx.reply(
        "❗ Использование:\n<code>/unban ID_пользователя</code>",
        { parse_mode: "HTML" }
      );
    }

    const userId = Number(args);

    try {
      await bot.telegram.unbanChatMember(ctx.chat.id, userId, {
        only_if_banned: true
      });

      bansDb.reload();
      delete bansDb.data[banKey(ctx.chat.id, userId)];
      bansDb.save();

      await ctx.reply(
        `✅ <b>ПОЛЬЗОВАТЕЛЬ РАЗБАНЕН</b>\n\n🆔 ID: <code>${userId}</code>`,
        { parse_mode: "HTML" }
      );
    } catch (e) {
      console.error("[MOD] Ошибка разбана:", e.message);
      await ctx.reply(`❌ Ошибка разбана:\n<code>${htmlEscape(e.message)}</code>`, {
        parse_mode: "HTML"
      });
    }
  }

  return {
    restoreMutes,
    handleMute,
    handleUnmute,
    handleBan,
    handleUnban
  };
}

module.exports = { createModerationModule };