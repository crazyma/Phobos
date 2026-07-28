/**
 * Canonical public origin for metadata, sitemap, robots, and share cards.
 * Deployment sets NEXT_PUBLIC_SITE_URL; the fallback keeps local builds and
 * preview environments deterministic until the production domain is supplied.
 */
export const DEFAULT_SITE_URL = "https://phobos.tw";

export function getSiteUrl(): URL {
  const configured = process.env.NEXT_PUBLIC_SITE_URL ?? DEFAULT_SITE_URL;
  try {
    return new URL(configured);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

/** Turn a site-relative pathname into an absolute canonical URL. */
export function siteUrl(pathname = "/"): string {
  return new URL(pathname, getSiteUrl()).toString();
}
