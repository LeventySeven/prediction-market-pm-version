import type { Metadata } from "next";
import { headers } from "next/headers";

type PageProps = {
  params: Promise<{ marketId: string }>;
};

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

const getBaseUrl = async () => {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  return host ? `${proto}://${host}` : "";
};

const fetchMarketPreview = async (marketId: string) => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_SECRET;
  if (!url || !anon) return null;

  const endpoint =
    `${url.replace(/\/$/, "")}/rest/v1/markets` +
    `?id=eq.${encodeURIComponent(marketId)}` +
    `&select=title_eng,title_rus,image_url`;

  const res = await fetch(endpoint, {
    // Static-ish: allow edge/CDN caching to keep it lightweight.
    next: { revalidate: 300 },
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ title_eng?: string | null; title_rus?: string | null; image_url?: string | null }>;
  const row = rows[0] ?? null;
  if (!row) return null;
  const title = (row.title_eng || row.title_rus || "Yalla Market").trim();
  const imageUrl = row.image_url?.trim() || null;
  return { title, imageUrl };
};

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { marketId } = await params;
  const baseUrl = await getBaseUrl();
  const valid = isUuid(marketId);
  const preview = valid ? await fetchMarketPreview(marketId) : null;
  const title = preview?.title ?? "Yalla Market";
  const image = preview?.imageUrl ?? `${baseUrl}/white.svg`;
  const url = `${baseUrl}/share/market/${marketId}`;

  return {
    title,
    description: "Yalla Market",
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description: "Yalla Market",
      url,
      images: [{ url: image }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: "Yalla Market",
      images: [image],
    },
  };
};

export default async function ShareMarketPage({ params }: PageProps) {
  const { marketId } = await params;
  const baseUrl = await getBaseUrl();
  const fallback = baseUrl ? `${baseUrl}/?marketId=${encodeURIComponent(marketId)}` : `/?marketId=${encodeURIComponent(marketId)}`;
  const target = fallback;
  const valid = isUuid(marketId);
  const preview = valid ? await fetchMarketPreview(marketId) : null;
  const title = preview?.title ?? "Yalla Market";
  const image = preview?.imageUrl ?? (baseUrl ? `${baseUrl}/white.svg` : "/white.svg");

  // IMPORTANT:
  // - We must return HTML (not a 3xx redirect) so Telegram can read OG meta tags for previews.
  // - For humans, we redirect (with a tiny delay so the UI can render).
  return (
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta httpEquiv="refresh" content={`1; url=${target}`} />
        <script>{`(function () { try { setTimeout(function () { try { window.location.replace(${JSON.stringify(target)}); } catch { window.location.href = ${JSON.stringify(target)}; } }, 200); } catch (e) {} })();`}</script>
      </head>
      <body
        style={{
          background: "#000",
          color: "#fff",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          margin: 0,
        }}
      >
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 20,
              border: "1px solid rgba(24,24,27,1)", // zinc-900-ish
              background: "rgba(0,0,0,1)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.55)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: 20,
                borderBottom: "1px solid rgba(24,24,27,1)",
                background:
                  "radial-gradient(700px 220px at 0% 0%, rgba(245,68,166,0.12), transparent 60%), radial-gradient(520px 180px at 100% 0%, rgba(190,255,29,0.08), transparent 55%)",
              }}
            >
              <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    overflow: "hidden",
                    border: "1px solid rgba(24,24,27,1)",
                    background: "rgba(9,9,11,1)",
                    flex: "0 0 auto",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>

                <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <div style={{ fontSize: 14, letterSpacing: 2.2, textTransform: "uppercase", color: "rgba(161,161,170,1)", fontWeight: 700 }}>
                    Yalla Market
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 18,
                      lineHeight: 1.25,
                      fontWeight: 700,
                      color: "rgba(244,244,245,1)",
                      wordBreak: "break-word",
                    }}
                  >
                    {title}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ padding: 18 }}>
              <div style={{ fontSize: 13, color: "rgba(161,161,170,1)" }}>Opening…</div>
              <div style={{ marginTop: 10, fontSize: 12, color: "rgba(113,113,122,1)" }}>
                If nothing happens,{" "}
                <a href={target} style={{ color: "rgba(244,244,245,1)", textDecoration: "underline", textUnderlineOffset: 3 }}>
                  open in web
                </a>
                .
              </div>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

