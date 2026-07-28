import { HomePageView } from "@/components/home/home-page";
import { getHome } from "@/lib/services";

// Homepage data refreshes alongside the two daily ETL batches (spec-02 §1).
export const revalidate = 1800;

export default async function HomePage() {
  return <HomePageView home={await getHome()} />;
}
