const parseFirstIp = (headerValue: string | null): string | null => {
  if (!headerValue) return null;
  const first = headerValue.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
};

const toBool = (value: string | undefined): boolean => {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

const shouldTrustProxyHeaders = (): boolean => {
  if (toBool(process.env.TRUST_PROXY_HEADERS)) return true;
  if (process.env.VERCEL) return true;
  if (process.env.RAILWAY_ENVIRONMENT) return true;
  return false;
};

export const getTrustedClientIpFromRequest = (req: Request): string | null => {
  if (!shouldTrustProxyHeaders()) return null;

  const headerCandidates = [
    req.headers.get("x-forwarded-for"),
    req.headers.get("x-real-ip"),
    req.headers.get("cf-connecting-ip"),
    req.headers.get("true-client-ip"),
    req.headers.get("fly-client-ip"),
  ];

  for (const candidate of headerCandidates) {
    const first = parseFirstIp(candidate);
    if (first) return first;
  }

  return null;
};
