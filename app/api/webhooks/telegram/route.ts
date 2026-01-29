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

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  throw new Error("TELEGRAM_BOT_TOKEN is not configured");
}

const bot = new Bot(token);

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

bot.command("start", replyWithStart);
bot.hears(/^start$/i, replyWithStart);
bot.callbackQuery("start", async (ctx) => {
  await ctx.answerCallbackQuery();
  await replyWithStart(ctx);
});

export const POST = webhookCallback(bot, "std/http");
