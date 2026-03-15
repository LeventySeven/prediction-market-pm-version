import HomePageClient from "@/components/HomePageClient";
import { getHomePageInitialData } from "@/src/server/markets/pageData";
import { detectLang } from "@/src/server/detectLang";

export const revalidate = 15; // ISR: regenerate every 15s, serve stale from edge meanwhile

export default async function HomePage() {
  const lang = await detectLang();
  const initialData = await getHomePageInitialData({
    initialView: "CATALOG",
    providerFilter: "all",
    lang,
  });

  return <HomePageClient {...initialData} />;
}
