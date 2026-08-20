export const SOURCING_1688_KEYWORD_SEARCH_PORT = Symbol('SOURCING_1688_KEYWORD_SEARCH_PORT');

/** Persistence-safe projection of one 1688 search offer. */
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

export interface Search1688KeywordSession {
  /** The caller invokes this serially so one owned page serves the full batch. */
  searchKeyword(input: { keyword: string; signal?: AbortSignal }): Promise<Search1688KeywordItem[]>;
  close(): Promise<void>;
}

export interface Sourcing1688KeywordSearchPort {
  openSession(input?: { signal?: AbortSignal }): Promise<Search1688KeywordSession>;
}

/** A human must restore the Office Chrome profile before this unit can retry. */
export class Sourcing1688KeywordAttentionError extends Error {
  readonly code = 'marketplace_login_required';

  constructor(readonly reason: 'login' | 'security_challenge') {
    super('1688 marketplace login requires operator attention');
    this.name = 'Sourcing1688KeywordAttentionError';
  }
}

/** Safe, bounded provider/configuration failure for later operation mapping. */
export class Sourcing1688KeywordProviderError extends Error {
  constructor(readonly code: 'cdp_configuration_invalid' | 'cdp_unavailable' | 'browser_context_unavailable' | 'search_extraction_failed') {
    super(`1688 keyword provider failed: ${code}`);
    this.name = 'Sourcing1688KeywordProviderError';
  }
}
