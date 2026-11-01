const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

async function telegram(env, method, payload) {
  const response = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  const result = await response.json();
  if (!response.ok || !result.ok) {
    console.error("Telegram API request failed", {
      method,
      status: response.status,
      description: result.description || "Unknown Telegram API error",
    });
    throw new Error("Telegram API request failed");
  }
  return result;
}

async function reply(env, chatId, text) {
  return telegram(env, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
}

async function handleMessage(message, env) {
  const chatId = message.chat?.id;
  const userId = message.from?.id;
  const text = (message.text || "").trim();
  if (!chatId || !text) return;

  if (env.ALLOWED_TELEGRAM_USER_ID &&
      String(userId) !== String(env.ALLOWED_TELEGRAM_USER_ID)) {
    await reply(env, chatId, "Sorry, this bot is private.");
    return;
  }

  const command = text.split(/\s+/, 1)[0].split("@")[0].toLowerCase();

  if (command === "/start") {
    await reply(env, chatId,
      "Your Cloud Agent is online.\n\nUse /help to see available commands.");
    return;
  }

  if (command === "/help") {
    await reply(env, chatId,
      "Available commands:\n/start — welcome message\n/help — show commands\n/status — check service and database\n/task <description> — save a task");
    return;
  }

  if (command === "/status") {
    try {
      await env.DB.prepare("SELECT 1 AS ok").first();
      await reply(env, chatId, "Cloud Agent is online. Telegram webhook and D1 database are working.");
    } catch (error) {
      console.error("D1 health check failed", error);
      await reply(env, chatId, "Worker is online, but the database check failed. Please check the D1 binding named DB.");
    }
    return;
  }

  if (command === "/task") {
    const description = text.replace(/^\/task(?:@\w+)?\s*/i, "").trim();
    if (!description) {
      await reply(env, chatId, "Usage: /task Write a description of what you want done");
      return;
    }
    if (description.length > 2000) {
      await reply(env, chatId, "Please keep task descriptions under 2,000 characters.");
      return;
    }
    try {
      const result = await env.DB.prepare(
        "INSERT INTO tasks (telegram_user_id, chat_id, description, status, created_at) VALUES (?, ?, ?, 'queued', CURRENT_TIMESTAMP)"
      ).bind(String(userId), String(chatId), description).run();
      await reply(env, chatId, `Task saved successfully.\nTask ID: ${result.meta.last_row_id}\nStatus: queued\n\nNote: task execution is not enabled yet.`);
    } catch (error) {
      console.error("Task save failed", error);
      await reply(env, chatId, "I couldn't save that task. Check that the D1 migration has been applied and the DB binding is configured.");
    }
    return;
  }

  await reply(env, chatId, "I don't recognize that command. Send /help.");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "cloud-agent-system" });
    }

    if (request.method !== "POST" || url.pathname !== "/telegram") {
      return new Response("Not found", { status: 404 });
    }

    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET || !env.DB) {
      console.error("Required Worker configuration is missing");
      return new Response("Worker configuration incomplete", { status: 503 });
    }

    const suppliedSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (suppliedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let update;
    try {
      update = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    try {
      if (update.message) await handleMessage(update.message, env);
      return json({ ok: true });
    } catch (error) {
      console.error("Webhook processing failed", error);
      return new Response("Webhook processing failed", { status: 500 });
    }
  },
};
