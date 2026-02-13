import type { Metadata } from "next";
import { headers } from "next/headers";
import HomePage from "../../page";

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
    next: { revalidate: 300 },
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
    },
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{
    title_eng?: string | null;
    title_rus?: string | null;
    image_url?: string | null;
  }>;
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
  const url = `${baseUrl}/market/${marketId}`;

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

export default function MarketRoutePage() {
  return <HomePage />;
}
