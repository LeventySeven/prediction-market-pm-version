import HomePageClient from "@/components/HomePageClient";
import { getHomePageInitialData } from "@/src/server/markets/pageData";

export const dynamic = "force-dynamic";

export default async function PolymarketPage() {
  const initialData = await getHomePageInitialData({
    initialView: "CATALOG",
    providerFilter: "polymarket",
  });

  return <HomePageClient {...initialData} />;
}
