import type { Metadata } from "next";
import { headers } from "next/headers";
import HomePage from "../../page";
import { getPolymarketMarketById } from "@/src/server/polymarket/client";

type PageProps = {
  params: Promise<{ marketId: string }>;
};

const isMarketId = (v: string) => /^[A-Za-z0-9:_-]{6,}$/.test(v);

const getBaseUrl = async () => {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  return host ? `${proto}://${host}` : "";
};

const fetchMarketPreview = async (marketId: string) => {
  const market = await getPolymarketMarketById(marketId);
  if (!market) return null;
  const title = market.title.trim() || "Yalla Market";
  const imageUrl = market.imageUrl?.trim() || null;
  return { title, imageUrl };
};

export const generateMetadata = async ({ params }: PageProps): Promise<Metadata> => {
  const { marketId } = await params;
  const baseUrl = await getBaseUrl();
  const valid = isMarketId(marketId);
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
