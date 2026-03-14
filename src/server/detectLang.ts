import "server-only";
import { headers } from "next/headers";

export const detectLang = async (): Promise<"RU" | "EN"> => {
  const h = await headers();
  const acceptLang = (h.get("accept-language") ?? "").toLowerCase();
  const cookie = h.get("cookie") ?? "";
  const langCookie = cookie.match(/(?:^|;\s*)lang=(RU|EN)/i)?.[1]?.toUpperCase();
  if (langCookie === "RU" || langCookie === "EN") return langCookie as "RU" | "EN";
  if (/\bru\b/.test(acceptLang)) return "RU";
  return "EN";
};
