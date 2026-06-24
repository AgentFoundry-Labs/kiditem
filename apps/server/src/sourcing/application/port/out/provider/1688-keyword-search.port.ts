export const SOURCING_1688_KEYWORD_SEARCH_PORT = Symbol('SOURCING_1688_KEYWORD_SEARCH_PORT');

export interface Search1688KeywordInput {
  keyword: string;
  page?: number;
  maxResults?: number;
}

export interface Search1688KeywordItem {
  offerId: string | null;
  title: string;
  priceCny: number | null;
  sourceUrl: string;
  imageUrl: string | null;
  monthlySales: number | null;
  tradeScore: number | null;
  repurchaseRate: string | null;
  supplierName: string | null;
  score: number;
}

export interface Search1688KeywordResult {
  keyword: string;
  page: number;
  items: Search1688KeywordItem[];
}

export interface Search1688KeywordStatus {
  configured: boolean;
  baseUrl: string;
}

export interface Sourcing1688KeywordSearchPort {
  getStatus(): Search1688KeywordStatus;
  searchByKeyword(input: Search1688KeywordInput): Promise<Search1688KeywordResult>;
}
