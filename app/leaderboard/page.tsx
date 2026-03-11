import HomePageClient from "@/components/HomePageClient";
import { getHomePageInitialData } from "@/src/server/markets/pageData";

export const dynamic = "force-dynamic";

export default async function LeaderboardPage() {
  const initialData = await getHomePageInitialData({
    initialView: "FRIENDS",
    providerFilter: "all",
  });

  return <HomePageClient {...initialData} />;
}
