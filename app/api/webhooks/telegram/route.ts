import { NextResponse } from "next/server";

export const runtime = "nodejs";

type TelegramUpdate = {
  message?: { text?: string; chat?: { id?: number } };
  callback_query?: { data?: string; message?: { chat?: { id?: number } } };
};

const START_TEXT = `Welcome to YALLA!
Here's what you can do:
- Bet on any event - sports, crypto, politics, memes
- Create your own prediction market in seconds
- Earn fees from markets you create

No initial liquidity needed. No permissions required.
Tap the button below to start predicting ⬇️`;

const getMiniAppUrl = () => {
  const raw =
    process.env.TELEGRAM_MINIAPP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  if (!raw) {
    throw new Error("TELEGRAM_MINIAPP_URL is not configured");
  }
  return raw.startsWith("http://") || raw.startsWith("https://") ? raw : `https://${raw}`;
};

const sendTelegramMessage = async (chatId: number) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: START_TEXT,
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
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
};

export async function POST(req: Request) {
  const update = (await req.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) {
    return NextResponse.json({ ok: false, error: "INVALID_PAYLOAD" }, { status: 400 });
  }

  const messageText = update.message?.text?.trim() ?? "";
  const callbackText = update.callback_query?.data?.trim() ?? "";
  const isStart =
    messageText.startsWith("/start") ||
    messageText.toLowerCase() === "start" ||
    callbackText.toLowerCase() === "start";

  if (!isStart) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const chatId =
    update.message?.chat?.id ??
    update.callback_query?.message?.chat?.id ??
    null;

  if (!chatId) {
    return NextResponse.json({ ok: false, error: "CHAT_ID_MISSING" }, { status: 400 });
  }

  await sendTelegramMessage(chatId);
  return NextResponse.json({ ok: true });
}
