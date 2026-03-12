const fs = require("fs");
const path = require("path");
const { Markup } = require("telegraf");
const { isAdmin, htmlEscape } = require("../utils/helpers");

function createAdminModule(bot, config, settingsDb, mutesDb, bansDb) {
  const { ADMIN_IDS } = config;

  const state = {
    waitingLink: new Set(),
    waitingImport: new Set(),
    waitingAddAdmin: new Set(),
    waitingRemoveAdmin: new Set()
  };

  function getRequiredLink() {
    settingsDb.reload();
    return settingsDb.data.requiredChannelLink || config.REQUIRED_CHANNEL_LINK;
  }

  function getAllAdminIds() {
    settingsDb.reload();

    const configAdmins = Array.isArray(ADMIN_IDS) ? ADMIN_IDS : [];
    const extraAdmins = Array.isArray(settingsDb.data.adminIds)
      ? settingsDb.data.adminIds
      : [];

    return [...new Set([...configAdmins, ...extraAdmins].map(Number))];
  }

  function isFullAdmin(userId) {
    return isAdmin(Number(userId), getAllAdminIds());
  }

  function isForceSubscriptionEnabled() {
    settingsDb.reload();
    return settingsDb.data.forceSubscription !== false;
  }

  function setForceSubscription(value) {
    settingsDb.reload();
    settingsDb.data.forceSubscription = Boolean(value);
    settingsDb.save();
  }

  function addAdminId(userId) {
    settingsDb.reload();

    if (!Array.isArray(settingsDb.data.adminIds)) {
      settingsDb.data.adminIds = [];
    }

    const id = Number(userId);

    if (!settingsDb.data.adminIds.includes(id) && !ADMIN_IDS.includes(id)) {
      settingsDb.data.adminIds.push(id);
      settingsDb.save();
    }

    return getAllAdminIds();
  }

  function removeAdminId(userId) {
    settingsDb.reload();

    if (!Array.isArray(settingsDb.data.adminIds)) {
      settingsDb.data.adminIds = [];
    }

    const id = Number(userId);

    if (ADMIN_IDS.includes(id)) {
      return { ok: false, reason: "main_admin" };
    }

    settingsDb.data.adminIds = settingsDb.data.adminIds.filter(
      (item) => Number(item) !== id
    );
    settingsDb.save();

    return { ok: true, admins: getAllAdminIds() };
  }

  function adminKeyboard() {
    const subText = isForceSubscriptionEnabled()
      ? "🟢 Обяз. подписка: ВКЛ"
      : "🔴 Обяз. подписка: ВЫКЛ";

    return Markup.inlineKeyboard([
      [
        Markup.button.callback("🔗 Заменить ссылку", "admin_change_link"),
        Markup.button.callback("🏓 Пинг бота", "admin_ping")
      ],
      [
        Markup.button.callback("📥 Импорт БД", "admin_import_db"),
        Markup.button.callback("📄 Муты / баны", "admin_lists")
      ],
      [
        Markup.button.callback("👑 Список админов", "admin_admins"),
        Markup.button.callback("➕ Добавить админа", "admin_add_admin")
      ],
      [
        Markup.button.callback("➖ Удалить админа", "admin_remove_admin"),
        Markup.button.callback(subText, "admin_toggle_sub")
      ],
      [Markup.button.callback("♻️ Рестарт бота", "admin_restart")]
    ]);
  }

  async function renderAdminPanel(ctx, textPrefix = "") {
    const subEnabled = isForceSubscriptionEnabled();

    return ctx.reply(
      `${textPrefix}⚙️ <b>Админ-панель</b>\n\n` +
        `Добро пожаловать в панель управления ботом.\n` +
        `Текущий статус обязательной подписки: ${subEnabled ? "<b>включена</b>" : "<b>выключена</b>"}.\n\n` +
        `Выберите нужное действие кнопками ниже.`,
      {
        parse_mode: "HTML",
        ...adminKeyboard()
      }
    );
  }

  async function handleAdminCommand(ctx) {
    if (!ctx.from || !isFullAdmin(ctx.from.id)) {
      return ctx.reply("❌ Доступ запрещён.");
    }

    if (!ctx.chat || ctx.chat.type !== "private") return;

    return renderAdminPanel(ctx);
  }

  async function handleAdminAction(ctx) {
    if (!ctx.from || !isFullAdmin(ctx.from.id)) {
      return ctx.answerCbQuery("Нет доступа", { show_alert: true });
    }

    if (!ctx.chat || ctx.chat.type !== "private") {
      return ctx.answerCbQuery("Только в ЛС", { show_alert: true });
    }

    const action = ctx.callbackQuery?.data;
    if (!action) return ctx.answerCbQuery();

    if (action === "admin_ping") {
      await ctx.answerCbQuery();
      return ctx.reply("🏓 <b>Бот онлайн</b>", { parse_mode: "HTML" });
    }

    if (action === "admin_change_link") {
      state.waitingLink.add(ctx.from.id);
      state.waitingImport.delete(ctx.from.id);
      state.waitingAddAdmin.delete(ctx.from.id);
      state.waitingRemoveAdmin.delete(ctx.from.id);

      await ctx.answerCbQuery();
      return ctx.reply(
        "🔗 <b>Замена обязательной ссылки</b>\n\n" +
          "Отправьте новую ссылку следующим сообщением.\n\n" +
          `Текущая ссылка:\n<code>${htmlEscape(getRequiredLink())}</code>`,
        { parse_mode: "HTML" }
      );
    }

    if (action === "admin_import_db") {
      state.waitingImport.add(ctx.from.id);
      state.waitingLink.delete(ctx.from.id);
      state.waitingAddAdmin.delete(ctx.from.id);
      state.waitingRemoveAdmin.delete(ctx.from.id);

      await ctx.answerCbQuery();
      return ctx.reply(
        "📥 <b>Импорт базы данных</b>\n\n" +
          "Отправьте файлом один из вариантов:\n" +
          "• <code>mutes.json</code>\n" +
          "• <code>bans.json</code>\n" +
          "• <code>settings.json</code>",
        { parse_mode: "HTML" }
      );
    }

    if (action === "admin_lists") {
      mutesDb.reload();
      bansDb.reload();

      const muteLines = Object.values(mutesDb.data)
        .slice(0, 20)
        .map(
          (item) =>
            `├ 🔇 <code>${item.userId}</code> | чат <code>${item.chatId}</code>`
        );

      const banLines = Object.values(bansDb.data)
        .slice(0, 20)
        .map(
          (item) =>
            `├ 🚫 <code>${item.userId}</code> | чат <code>${item.chatId}</code>`
        );

      await ctx.answerCbQuery();
      return ctx.reply(
        `📄 <b>Списки ограничений</b>\n\n` +
          `🔇 Мутов в базе: <b>${Object.keys(mutesDb.data).length}</b>\n` +
          `${muteLines.length ? muteLines.join("\n") : "├ Нет активных мутов"}\n\n` +
          `🚫 Банов в базе: <b>${Object.keys(bansDb.data).length}</b>\n` +
          `${banLines.length ? banLines.join("\n") : "├ Нет активных банов"}`,
        { parse_mode: "HTML" }
      );
    }

    if (action === "admin_admins") {
      const admins = getAllAdminIds();

      await ctx.answerCbQuery();
      return ctx.reply(
        "👑 <b>Список админов</b>\n\n" +
          admins.map((id) => `├ <code>${id}</code>`).join("\n"),
        { parse_mode: "HTML" }
      );
    }

    if (action === "admin_add_admin") {
      state.waitingAddAdmin.add(ctx.from.id);
      state.waitingRemoveAdmin.delete(ctx.from.id);
      state.waitingLink.delete(ctx.from.id);
      state.waitingImport.delete(ctx.from.id);

      await ctx.answerCbQuery();
      return ctx.reply(
        "➕ <b>Добавление администратора</b>\n\n" +
          "Отправьте следующим сообщением Telegram ID пользователя.",
        { parse_mode: "HTML" }
      );
    }

    if (action === "admin_remove_admin") {
      state.waitingRemoveAdmin.add(ctx.from.id);
      state.waitingAddAdmin.delete(ctx.from.id);
      state.waitingLink.delete(ctx.from.id);
      state.waitingImport.delete(ctx.from.id);

      await ctx.answerCbQuery();
      return ctx.reply(
        "➖ <b>Удаление администратора</b>\n\n" +
          "Отправьте следующим сообщением Telegram ID пользователя.",
        { parse_mode: "HTML" }
      );
    }

    if (action === "admin_toggle_sub") {
      const nextValue = !isForceSubscriptionEnabled();
      setForceSubscription(nextValue);

      await ctx.answerCbQuery(nextValue ? "Подписка включена" : "Подписка выключена");
      return renderAdminPanel(
        ctx,
        nextValue
          ? "✅ <b>Обязательная подписка включена</b>\n\n"
          : "✅ <b>Обязательная подписка отключена</b>\n\n"
      );
    }

    if (action === "admin_restart") {
      await ctx.answerCbQuery("Перезапуск...");

      await ctx.reply(
        "♻️ <b>Перезапуск бота</b>\n\n" +
          "Бот завершает процесс и запускается заново, если у тебя стоит PM2 / Docker / systemd.",
        { parse_mode: "HTML" }
      );

      setTimeout(() => {
        process.exit(0);
      }, 1000);

      return;
    }

    return ctx.answerCbQuery();
  }

  async function handlePrivateText(ctx) {
    if (!ctx.from || !isFullAdmin(ctx.from.id)) return;
    if (!ctx.chat || ctx.chat.type !== "private") return;

    const text = ctx.message?.text?.trim();
    if (!text) return;

    if (state.waitingAddAdmin.has(ctx.from.id)) {
      if (!/^\d+$/.test(text)) {
        return ctx.reply(
          "❌ Неверный ID.\n\nОтправьте только числовой Telegram ID.",
          { parse_mode: "HTML" }
        );
      }

      const admins = addAdminId(Number(text));
      state.waitingAddAdmin.delete(ctx.from.id);

      return ctx.reply(
        "✅ <b>Администратор добавлен</b>\n\n" +
          admins.map((id) => `├ <code>${id}</code>`).join("\n"),
        { parse_mode: "HTML" }
      );
    }

    if (state.waitingRemoveAdmin.has(ctx.from.id)) {
      if (!/^\d+$/.test(text)) {
        return ctx.reply(
          "❌ Неверный ID.\n\nОтправьте только числовой Telegram ID.",
          { parse_mode: "HTML" }
        );
      }

      const result = removeAdminId(Number(text));
      state.waitingRemoveAdmin.delete(ctx.from.id);

      if (!result.ok && result.reason === "main_admin") {
        return ctx.reply(
          "❌ Этого админа нельзя удалить, потому что он прописан в config.js как основной.",
          { parse_mode: "HTML" }
        );
      }

      return ctx.reply(
        "✅ <b>Администратор удалён</b>\n\n" +
          result.admins.map((id) => `├ <code>${id}</code>`).join("\n"),
        { parse_mode: "HTML" }
      );
    }

    if (state.waitingLink.has(ctx.from.id)) {
      if (!/^https?:\/\/t\.me\//i.test(text)) {
        return ctx.reply(
          "❌ Неверный формат ссылки.\n\n" +
            "Пришлите ссылку в формате:\n" +
            "<code>https://t.me/...</code>",
          { parse_mode: "HTML" }
        );
      }

      settingsDb.reload();
      settingsDb.data.requiredChannelLink = text;
      settingsDb.save();
      state.waitingLink.delete(ctx.from.id);

      return ctx.reply(
        "✅ <b>Обязательная ссылка обновлена</b>\n\n" +
          `Новая ссылка:\n<code>${htmlEscape(text)}</code>`,
        { parse_mode: "HTML" }
      );
    }
  }

  async function handlePrivateDocument(ctx) {
    if (!ctx.from || !isFullAdmin(ctx.from.id)) return;
    if (!ctx.chat || ctx.chat.type !== "private") return;
    if (!state.waitingImport.has(ctx.from.id)) return;

    const doc = ctx.message?.document;
    if (!doc) return;

    const allowed = ["mutes.json", "bans.json", "settings.json"];
    if (!allowed.includes(doc.file_name)) {
      return ctx.reply(
        "❌ Неверный файл.\n\n" +
          "Разрешены только:\n" +
          "• <code>mutes.json</code>\n" +
          "• <code>bans.json</code>\n" +
          "• <code>settings.json</code>",
        { parse_mode: "HTML" }
      );
    }

    try {
      const link = await ctx.telegram.getFileLink(doc.file_id);
      const response = await fetch(link.href);
      const text = await response.text();
      const parsed = JSON.parse(text);

      const targetPath = path.join(__dirname, "..", "data", doc.file_name);
      fs.writeFileSync(targetPath, JSON.stringify(parsed, null, 2), "utf-8");

      if (doc.file_name === "mutes.json") mutesDb.reload();
      if (doc.file_name === "bans.json") bansDb.reload();
      if (doc.file_name === "settings.json") settingsDb.reload();

      state.waitingImport.delete(ctx.from.id);

      return ctx.reply(
        `✅ <b>Файл импортирован</b>\n\n<code>${doc.file_name}</code> успешно заменён.`,
        { parse_mode: "HTML" }
      );
    } catch (e) {
      return ctx.reply(
        `❌ Ошибка импорта:\n<code>${htmlEscape(e.message)}</code>`,
        { parse_mode: "HTML" }
      );
    }
  }

  return {
    getRequiredLink,
    isForceSubscriptionEnabled,
    handleAdminCommand,
    handleAdminAction,
    handlePrivateText,
    handlePrivateDocument
  };
}

module.exports = { createAdminModule };
