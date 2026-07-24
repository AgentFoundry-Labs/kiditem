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
  private refreshInFlight: Promise<KiditemStorefrontProduct[]> | null = null;

  // 자사몰은 외부 HTTP 스크래핑(euc-kr, 최대 20페이지)이라 느리고 불안정하다.
  // 경쟁 판매자 개요 응답이 이 fetch에 매번 블로킹되면 스켈레톤이 길어지므로
  // stale-while-revalidate: 만료된 캐시라도 즉시 반환하고 갱신은 백그라운드로 돌려
  // 외부 fetch를 응답 크리티컬 패스에서 뺀다. 캐시가 아예 없을 때만 네트워크를 기다린다.
  async listNewProducts(): Promise<KiditemStorefrontProduct[]> {
    const cache = this.cache;

    if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
      return cache.products;
    }

    if (cache) {
      void this.refresh().catch(() => undefined);
      return cache.products;
    }

    return this.refresh();
  }

  private refresh(): Promise<KiditemStorefrontProduct[]> {
    if (this.refreshInFlight) return this.refreshInFlight;
    const run = this.fetchAllPages()
      .then((products) => {
        this.cache = { products, fetchedAt: Date.now() };
        return products;
      })
      .catch((error: unknown) => {
        // 갱신 실패 시 기존 캐시를 유지한다. 캐시가 없는 최초 로드 실패만 상위로 던진다.
        if (this.cache) return this.cache.products;
        throw error;
      })
      .finally(() => {
        this.refreshInFlight = null;
      });
    this.refreshInFlight = run;
    return run;
  }

  private async fetchAllPages(): Promise<KiditemStorefrontProduct[]> {
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
    return uniqueProducts;
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
