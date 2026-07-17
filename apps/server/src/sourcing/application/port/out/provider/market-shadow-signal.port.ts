export const MARKET_SHADOW_SIGNAL_PORT = Symbol('MARKET_SHADOW_SIGNAL_PORT');

export type MarketShadowSignalSource = 'google-trends-rss';

export interface MarketShadowSignalNewsItem {
  title: string | null;
  url: string | null;
  source: string | null;
}

export interface MarketShadowSignalItem {
  externalId: string;
  source: MarketShadowSignalSource;
  title: string;
  rawTitle: string;
  approximateTraffic: number | null;
  approximateTrafficLabel: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  newsItems: MarketShadowSignalNewsItem[];
  relevanceLabel: string | null;
  raw: Record<string, unknown>;
}

export interface FetchMarketShadowSignalsInput {
  seedKeywords?: readonly string[];
  limit?: number;
}

export interface FetchMarketShadowSignalsResult {
  source: MarketShadowSignalSource;
  generatedAt: string;
  items: MarketShadowSignalItem[];
}

export interface MarketShadowSignalPort {
  fetchTrending(input: FetchMarketShadowSignalsInput): Promise<FetchMarketShadowSignalsResult>;
}

export const LINKFOX_ECHOTIK_SHADOW_PORT = Symbol('LINKFOX_ECHOTIK_SHADOW_PORT');

export const LINKFOX_ECHOTIK_SUPPORTED_REGIONS = [
  'US',
  'GB',
  'ID',
  'TH',
  'PH',
  'MY',
  'VN',
  'MX',
  'SG',
  'SA',
  'BR',
  'ES',
  'JP',
  'DE',
  'IT',
  'FR',
] as const;

export type LinkfoxEchotikRegion = (typeof LINKFOX_ECHOTIK_SUPPORTED_REGIONS)[number];

export interface FetchLinkfoxEchotikNewProductRankInput {
  date: string;
  region: string;
  pageSize?: number;
}

export interface LinkfoxEchotikShadowProduct {
  asin: string | null;
  title: string | null;
  region: LinkfoxEchotikRegion;
  price: number | null;
  minPrice: number | null;
  maxPrice: number | null;
  currency: string | null;
  totalSaleCnt: number | null;
  totalSale30dCnt: number | null;
  gmv: number | null;
  salesTrendFlagText: string | null;
  videoCount: number | null;
  liveCount: number | null;
  influencerCount: number | null;
  commission: number | null;
  rating: number | null;
  reviewCount: number | null;
  availableDate: string | null;
  categoryId: string | null;
  imageUrls: string[];
  raw: Record<string, unknown>;
}

export interface FetchLinkfoxEchotikNewProductRankResult {
  source: 'linkfox-echotik-new-product-rank';
  generatedAt: string;
  date: string;
  region: LinkfoxEchotikRegion;
  pageSize: number;
  total: number | null;
  costToken: number | null;
  products: LinkfoxEchotikShadowProduct[];
}

export interface LinkfoxEchotikShadowPort {
  fetchNewProductRank(
    input: FetchLinkfoxEchotikNewProductRankInput,
  ): Promise<FetchLinkfoxEchotikNewProductRankResult>;
}
