import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

/** Next metadata route → /robots.txt. Public v1 content is fully crawlable. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: siteUrl("/sitemap.xml"),
  };
}
