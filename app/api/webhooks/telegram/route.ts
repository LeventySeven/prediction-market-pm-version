import { Bot, type Context, webhookCallback } from "grammy";

export const runtime = "edge";

const START_TEXT = `Welcome to YALLA!
Here's what you can do:
- Bet on any event - sports, crypto, politics, memes
- Create your own prediction market in seconds
- Earn fees from markets you create

No initial liquidity needed. No permissions required.
Tap the button below to start predicting ⬇️`;

const getMiniAppUrl = () => {
  const url = process.env.TELEGRAM_MINIAPP_URL;
  if (!url) {
    throw new Error("TELEGRAM_MINIAPP_URL is not configured");
  }
  return url;
};

const getAppUrl = () => {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  if (!raw) {
    throw new Error("APP_URL is not configured");
  }
  return raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
};

const getTelegramLoginUrl = () => {
  const url = new URL("/api/auth/telegram-login", getAppUrl());
  url.searchParams.set("redirect", "/");
  return url.toString();
};

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not configured");
}

const bot = new Bot(token);

const replyWithLogin = async (ctx: Context) => {
  await ctx.reply("Authorize to log in on the website:", {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Authorize",
            login_url: {
              url: getTelegramLoginUrl(),
            },
          },
        ],
      ],
    },
  });
};

const replyWithStart = async (ctx: Context) => {
  await ctx.reply(START_TEXT, {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: "Open Yalla Market",
            web_app: { url: getMiniAppUrl() },
          },
        ],
      ],
    },
  });
};

bot.command("start", async (ctx) => {
  const payload = typeof ctx.match === "string" ? ctx.match.trim() : "";
  if (payload.toLowerCase().startsWith("login")) {
    await replyWithLogin(ctx);
    return;
  }
  await replyWithStart(ctx);
});
bot.hears(/^start$/i, replyWithStart);
bot.callbackQuery("start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await replyWithStart(ctx);
});

export const POST = webhookCallback(bot, "std/http");
