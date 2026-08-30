export const SOURCING_BROWSER_SCRAPE_PORT = Symbol('SOURCING_BROWSER_SCRAPE_PORT');

/** Approved supplier-browser boundary; callers never receive raw browser payloads. */
export interface SourcingBrowserScrapePort {
  scrapeProductUrl(input: { sourceUrl: string }): Promise<Record<string, unknown>>;
}
