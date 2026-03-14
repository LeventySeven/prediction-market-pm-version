import HomePageClient from "@/components/HomePageClient";
import { getHomePageInitialData } from "@/src/server/markets/pageData";
import { detectLang } from "@/src/server/detectLang";

export const dynamic = "force-dynamic";

export default async function FeedPage() {
  const lang = await detectLang();
  const initialData = await getHomePageInitialData({
    initialView: "FEED",
    providerFilter: "all",
    lang,
  });

  return <HomePageClient {...initialData} />;
}
