/** Public origin used to absolutize metadata URLs (og:url, og:image,
 *  canonical). SITE_URL wins when set — use it to pin one domain. On Vercel
 *  VERCEL_PROJECT_PRODUCTION_URL holds the shortest production domain (a
 *  custom one when attached, no scheme); local dev falls back to localhost.
 *  Without a base, Next resolves relative metadata URLs against localhost,
 *  and link previews break. */
export function siteUrl(): URL {
  if (process.env.SITE_URL) return new URL(process.env.SITE_URL);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return new URL(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  return new URL(`http://localhost:${process.env.PORT ?? 3000}`);
}

/** The public source repository — linked from the landing page. */
export const SOURCE_URL = "https://github.com/martin0x/polaris";
