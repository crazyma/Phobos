import type { MetadataRoute } from "next";
import { getSitemapEntries } from "@/lib/seo/sitemap";

/** Next metadata route → /sitemap.xml. Includes archived player URLs by design. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return getSitemapEntries();
}
