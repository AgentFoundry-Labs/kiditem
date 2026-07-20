import { Injectable } from "@nestjs/common";
import type {
  KiditemStorefrontPort,
  KiditemStorefrontProduct,
} from "../../../application/port/out/provider/kiditem-storefront.port";

const STOREFRONT_URL =
  "http://www.kiditem.com/shop/shopbrand.html?xcode=024&type=P";
const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class KiditemStorefrontAdapter implements KiditemStorefrontPort {
  private cache: {
    products: KiditemStorefrontProduct[];
    fetchedAt: number;
  } | null = null;

  async listNewProducts(): Promise<KiditemStorefrontProduct[]> {
    const now = Date.now();
    if (this.cache && now - this.cache.fetchedAt < CACHE_TTL_MS) {
      return this.cache.products;
    }

    try {
      const firstPageHtml = await this.fetchPage(STOREFRONT_URL);
      const pageCount = parseKiditemStorefrontPageCount(firstPageHtml);
      const remainingPages = await Promise.all(
        Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => {
          const url = new URL(STOREFRONT_URL);
          url.searchParams.set("page", String(index + 2));
          return this.fetchPage(url.toString());
        }),
      );
      const products = [firstPageHtml, ...remainingPages].flatMap((html) =>
        parseKiditemStorefrontHtml(html),
      );
      const uniqueProducts = [
        ...new Map(
          products.map((product) => [product.externalId, product]),
        ).values(),
      ];
      if (uniqueProducts.length === 0) {
        throw new Error("KidItem storefront returned no product rows");
      }
      this.cache = { products: uniqueProducts, fetchedAt: now };
      return uniqueProducts;
    } catch (error) {
      if (this.cache) return this.cache.products;
      throw error;
    }
  }

  private async fetchPage(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: { Accept: "text/html" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`KidItem storefront returned HTTP ${response.status}`);
    }
    const bytes = await response.arrayBuffer();
    return new TextDecoder("euc-kr").decode(bytes);
  }
}

export function parseKiditemStorefrontHtml(
  html: string,
): KiditemStorefrontProduct[] {
  const products: KiditemStorefrontProduct[] = [];
  const seen = new Set<string>();
  const pattern =
    /<p\s+class=["']goods_grid_name["'][^>]*>\s*<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>\s*<\/p>/gi;

  for (const match of html.matchAll(pattern)) {
    const rawLink = decodeHtml(match[1]);
    const name = decodeHtml(match[2].replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    if (!name) continue;
    const link = new URL(rawLink, STOREFRONT_URL).toString();
    const externalId = new URL(link).searchParams.get("branduid") ?? link;
    if (seen.has(externalId)) continue;
    seen.add(externalId);
    products.push({ externalId, name, link });
  }
  return products;
}

export function parseKiditemStorefrontPageCount(html: string): number {
  const pages = [...html.matchAll(/[?&](?:amp;)?page=(\d+)/gi)]
    .map((match) => Number(match[1]))
    .filter((page) => Number.isInteger(page) && page > 0 && page <= 20);
  return Math.max(1, ...pages);
}

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    );
}
