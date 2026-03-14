const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "x-csrf-token";

const normalizeHost = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  return trimmed.replace(/\.$/, "");
};

const hostFromUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    return normalizeHost(new URL(value).host);
  } catch {
    return null;
  }
};

const parseOriginHost = (request: Request): string | null => {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      return normalizeHost(new URL(origin).host);
    } catch {
      return null;
    }
  }

  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    return normalizeHost(new URL(referer).host);
  } catch {
    return null;
  }
};

const getAllowedHosts = (request: Request): Set<string> => {
  const hosts = new Set<string>();
  const hostHeaders = [
    request.headers.get("x-forwarded-host"),
    request.headers.get("host"),
  ];

  for (const value of hostHeaders) {
    const normalized = normalizeHost(value);
    if (normalized) hosts.add(normalized);
  }

  const appHosts = [
    hostFromUrl(process.env.APP_URL),
    hostFromUrl(process.env.NEXT_PUBLIC_APP_URL),
  ];

  for (const value of appHosts) {
    if (value) hosts.add(value);
  }

  return hosts;
};

export const buildCsrfCookieValue = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }
  // Fallback: use crypto.randomBytes for secure token generation in Node.js
  try {
    const { randomBytes } = require("node:crypto");
    return randomBytes(16).toString("hex");
  } catch {
    // Last-resort fallback if crypto module is somehow unavailable
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
};

export const csrfCookie = (token: string): string => {
  const isProd = process.env.NODE_ENV === "production";
  const sameSite = isProd ? "None" : "Lax";
  const secure = isProd ? " Secure;" : "";
  const maxAge = 60 * 60 * 24 * 30;
  return `${CSRF_COOKIE_NAME}=${token}; Path=/; SameSite=${sameSite}; Max-Age=${maxAge};${secure}`;
};

export const getCsrfCookieName = () => CSRF_COOKIE_NAME;

export const getCsrfHeaderName = () => CSRF_HEADER_NAME;

export const assertCsrfForMutation = (
  request: Request,
  cookies: Record<string, string | undefined>
): void => {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  const csrfCookieValue = (cookies[CSRF_COOKIE_NAME] || "").trim();
  const csrfHeaderValue = (request.headers.get(CSRF_HEADER_NAME) || "").trim();

  if (!csrfCookieValue || !csrfHeaderValue || csrfCookieValue !== csrfHeaderValue) {
    throw new Error("CSRF_TOKEN_INVALID");
  }

  const originHost = parseOriginHost(request);
  const allowedHosts = getAllowedHosts(request);
  if (originHost && allowedHosts.size > 0 && !allowedHosts.has(originHost)) {
    throw new Error("CSRF_ORIGIN_INVALID");
  }
};
