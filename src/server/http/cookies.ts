export function parseCookies(req: Request): Record<string, string> {
  // Use a null-prototype object to avoid `__proto__` / constructor weirdness.
  const out: Record<string, string> = Object.create(null);
  const cookieHeader = req.headers.get("cookie") || "";
  if (!cookieHeader) return out;

  for (const part of cookieHeader.split(";")) {
    const s = part.trim();
    if (!s) continue;

    const eq = s.indexOf("=");
    // Skip invalid cookie segments like "foo" (no "=")
    if (eq <= 0) continue;

    const key = s.slice(0, eq).trim();
    if (!key) continue;

    // Defense-in-depth: don't allow prototype keys even though out has null prototype.
    if (key === "__proto__" || key === "prototype" || key === "constructor") continue;

    const value = s.slice(eq + 1);
    out[key] = value;
  }

  return out;
}

