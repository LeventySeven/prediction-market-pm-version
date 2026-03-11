import HomePageClient from "@/components/HomePageClient";
import { getHomePageInitialData } from "@/src/server/markets/pageData";

export const dynamic = "force-dynamic";

export default async function MyBetsPage() {
  const initialData = await getHomePageInitialData({
    initialView: "FEED",
    providerFilter: "all",
  });

  return <HomePageClient {...initialData} />;
}
