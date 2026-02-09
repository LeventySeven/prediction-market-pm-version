import { NextResponse } from "next/server";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createSupabaseUserClient, getSupabaseServiceClient } from "@/src/server/supabase/client";
import { authCookie, signAuthToken } from "@/src/server/auth/jwt";
import type { Database } from "@/src/types/database";

export const runtime = "nodejs";

const SUPABASE_ACCESS_COOKIE = "sb_access_token";
const SUPABASE_REFRESH_COOKIE = "sb_refresh_token";
const SUPABASE_REFRESH_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const secureCookie = process.env.NODE_ENV === "production" ? " Secure;" : "";

const buildCookie = (name: string, value: string, maxAgeSeconds: number) =>
  `${name}=${value}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAgeSeconds};${secureCookie}`;

const supabaseAccessCookie = (token: string, expiresIn?: number | null) =>
  buildCookie(SUPABASE_ACCESS_COOKIE, token, Math.max(1, expiresIn ?? 3600));

const supabaseRefreshCookie = (token: string) =>
  buildCookie(SUPABASE_REFRESH_COOKIE, token, SUPABASE_REFRESH_MAX_AGE);

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

const normalizeRedirect = (value: string | null) => {
  if (!value) return "/";
  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) return "/";
  if (trimmed.startsWith("//")) return "/";
  return trimmed;
};

type DbUserRow = Database["public"]["Tables"]["users"]["Row"];
type UserInsert = Database["public"]["Tables"]["users"]["Insert"];
type WalletBalanceInsert = Database["public"]["Tables"]["wallet_balances"]["Insert"];

const DEFAULT_ASSET = "VCOIN";
const VCOIN_DECIMALS = 6;
const SIGNUP_BONUS_MAJOR = 1500;
const SIGNUP_BONUS_MINOR = SIGNUP_BONUS_MAJOR * Math.pow(10, VCOIN_DECIMALS);

const TELEGRAM_PLACEHOLDER_DOMAIN = "telegram.local";
const buildTelegramEmail = (telegramId: number) => `tg_${telegramId}@${TELEGRAM_PLACEHOLDER_DOMAIN}`;
const buildTelegramUsername = (telegramId: number) => `tg_${telegramId}`;

const verifyTelegramLogin = (params: URLSearchParams, botToken: string) => {
  const hash = params.get("hash");
  if (!hash) {
    throw new Error("TELEGRAM_LOGIN_MISSING_HASH");
  }

  const entries: Array<[string, string]> = [];
  for (const [key, value] of params.entries()) {
    if (key === "hash") continue;
    entries.push([key, value]);
  }
  entries.sort(([a], [b]) => a.localeCompare(b));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const expected = Buffer.from(expectedHash, "hex");
  const received = Buffer.from(hash, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new Error("TELEGRAM_LOGIN_INVALID_HASH");
  }

  const authDateRaw = params.get("auth_date");
  const authDate = authDateRaw ? Number(authDateRaw) : null;
  if (authDate && Number.isFinite(authDate)) {
    const now = Math.floor(Date.now() / 1000);
    const maxAgeSeconds = 60 * 60 * 24; // 24 hours
    if (authDate > now + 60 || now - authDate > maxAgeSeconds) {
      throw new Error("TELEGRAM_LOGIN_EXPIRED");
    }
  }

  const idRaw = params.get("id");
  const telegramId = idRaw ? Number(idRaw) : NaN;
  if (!Number.isFinite(telegramId)) {
    throw new Error("TELEGRAM_LOGIN_MISSING_ID");
  }

  return {
    telegramId,
    username: params.get("username") || null,
    firstName: params.get("first_name") || null,
    lastName: params.get("last_name") || null,
    photoUrl: params.get("photo_url") || null,
    authDate: authDate && Number.isFinite(authDate) ? authDate : null,
  };
};

export async function GET(req: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return new NextResponse("TELEGRAM_BOT_TOKEN_NOT_SET", { status: 500 });
  }

  const url = new URL(req.url);
  const redirectTo = normalizeRedirect(url.searchParams.get("redirect"));

  let telegramId: number;
  let username: string | null;
  let firstName: string | null;
  let lastName: string | null;
  let photoUrl: string | null;
  let authDate: number | null;
  try {
    ({ telegramId, username, firstName, lastName, photoUrl, authDate } = verifyTelegramLogin(
      url.searchParams,
      botToken
    ));
  } catch (err) {
    const message = err instanceof Error ? err.message : "TELEGRAM_LOGIN_INVALID";
    return new NextResponse(message, { status: 401 });
  }

  const supabaseService = getSupabaseServiceClient();
  const { data: existing, error: existingError } = await supabaseService
    .from("users")
    .select("id, email, username, is_admin")
    .eq("telegram_id", telegramId)
    .maybeSingle();

  const password = randomBytes(24).toString("base64url");
  let authUserId: string | null = existing?.id ?? null;
  let authEmail = existing?.email ?? null;
  let authUsername = existing?.username ?? null;
  let authIsAdmin = existing?.is_admin ?? false;

  if (existingError) {
    return new NextResponse(existingError.message, { status: 500 });
  }

  if (!authUserId) {
    const fallbackUsername = username?.trim() || buildTelegramUsername(telegramId);
    const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const displayName = fullName || fallbackUsername;
    const email = buildTelegramEmail(telegramId);

    const created = await supabaseService.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: fallbackUsername,
        telegram_id: telegramId,
      },
    });

    if (created.error || !created.data?.user) {
      return new NextResponse(created.error?.message ?? "SUPABASE_AUTH_CREATE_FAILED", { status: 500 });
    }

    authUserId = created.data.user.id;
    authEmail = email;
    authUsername = fallbackUsername;
    authIsAdmin = false;

    const payload: UserInsert = {
      id: authUserId,
      email,
      username: fallbackUsername,
      display_name: displayName,
      avatar_url: photoUrl?.trim() || null,
      telegram_id: telegramId,
      telegram_username: username?.trim() || null,
      telegram_first_name: firstName?.trim() || null,
      telegram_last_name: lastName?.trim() || null,
      telegram_photo_url: photoUrl?.trim() || null,
      telegram_auth_date: authDate ? new Date(authDate * 1000).toISOString() : null,
    };

    const inserted = await supabaseService.from("users").insert(payload).select("id").single();
    if (inserted.error || !inserted.data) {
      return new NextResponse(inserted.error?.message ?? "USER_INSERT_FAILED", { status: 500 });
    }

    await supabaseService
      .from("wallet_balances")
      .upsert(
        {
          user_id: authUserId,
          asset_code: DEFAULT_ASSET,
          balance_minor: SIGNUP_BONUS_MINOR,
        } as WalletBalanceInsert,
        { onConflict: "user_id,asset_code", ignoreDuplicates: true }
      );
  } else {
    const updatedAuth = await supabaseService.auth.admin.updateUserById(authUserId, {
      password,
      email_confirm: true,
    });
    if (updatedAuth.error) {
      return new NextResponse(updatedAuth.error.message, { status: 500 });
    }
  }

  if (!authEmail) {
    return new NextResponse("TELEGRAM_LOGIN_EMAIL_MISSING", { status: 500 });
  }

  const supabase = createSupabaseUserClient();
  const signIn = await supabase.auth.signInWithPassword({
    email: authEmail,
    password,
  });
  if (signIn.error || !signIn.data?.session) {
    return new NextResponse(signIn.error?.message ?? "SUPABASE_SIGNIN_FAILED", { status: 500 });
  }

  const authToken = await signAuthToken({
    sub: String(authUserId),
    email: authEmail ?? "",
    username: authUsername ?? "",
    isAdmin: Boolean(authIsAdmin),
  });

  const response = NextResponse.redirect(new URL(redirectTo, getAppUrl()));
  response.headers.append(
    "Set-Cookie",
    supabaseAccessCookie(signIn.data.session.access_token, signIn.data.session.expires_in)
  );
  if (signIn.data.session.refresh_token) {
    response.headers.append("Set-Cookie", supabaseRefreshCookie(signIn.data.session.refresh_token));
  }
  response.headers.append("Set-Cookie", authCookie(authToken));
  return response;
}
