import HomePageClient from "@/components/HomePageClient";
import { getHomePageInitialData } from "@/src/server/markets/pageData";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const initialData = await getHomePageInitialData({
    initialView: "CATALOG",
    providerFilter: "all",
  });

  return <HomePageClient {...initialData} />;
}
