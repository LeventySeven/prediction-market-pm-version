import HomePageClient from "@/components/HomePageClient";
import { getHomePageInitialData } from "@/src/server/markets/pageData";

export const dynamic = "force-dynamic";

export default async function ProfilePageRoute() {
  const initialData = await getHomePageInitialData({
    initialView: "PROFILE",
    providerFilter: "all",
  });

  return <HomePageClient {...initialData} />;
}
