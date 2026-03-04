import type { Metadata } from "next";
import { headers } from "next/headers";
import HomePage from "../../page";
import { getPolymarketMarketById } from "@/src/server/polymarket/client";
import { limitlessAdapter } from "@/src/server/venues/limitlessAdapter";

type PageProps = {
  params: Promise<{ marketId: string }>;
};

const isMarketId = (v: string) => /^[A-Za-z0-9:_-]{6,}$/.test(v);

const parseMarketRef = (marketId: string): { provider: "polymarket" | "limitless"; providerMarketId: string } => {
  const clean = marketId.trim();
  if (clean.startsWith("limitless:")) {
    return {
      provider: "limitless",
      providerMarketId: clean.slice("limitless:".length),
    };
  }
  if (clean.startsWith("polymarket:")) {
    return {
      provider: "polymarket",
      providerMarketId: clean.slice("polymarket:".length),
    };
  }
  return { provider: "polymarket", providerMarketId: clean };
};

const getBaseUrl = async () => {
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  return host ? `${proto}://${host}` : "";
};

const fetchMarketPreview = async (marketId: string) => {
  const ref = parseMarketRef(marketId);
  if (ref.provider === "limitless") {
    const market = await limitlessAdapter.getMarketById(ref.providerMarketId);
    if (!market) return null;
    return {
      title: market.title.trim() || "Yalla Market",
      imageUrl: market.imageUrl?.trim() || null,
    };
  }

  const market = await getPolymarketMarketById(ref.providerMarketId);
  if (!market) return null;
  return {
    title: market.title.trim() || "Yalla Market",
    imageUrl: market.imageUrl?.trim() || null,
  };
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
