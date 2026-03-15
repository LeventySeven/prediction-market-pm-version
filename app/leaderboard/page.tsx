import HomePageClient from "@/components/HomePageClient";
import { getHomePageInitialData } from "@/src/server/markets/pageData";
import { detectLang } from "@/src/server/detectLang";

export const revalidate = 30; // leaderboard changes less frequently

export default async function LeaderboardPage() {
  const lang = await detectLang();
  const initialData = await getHomePageInitialData({
    initialView: "FRIENDS",
    providerFilter: "all",
    lang,
  });

  return <HomePageClient {...initialData} />;
}
