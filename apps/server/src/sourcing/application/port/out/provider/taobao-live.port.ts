export const TAOBAO_LIVE_PORT = Symbol('TaobaoLivePort');

export interface TaobaoLiveReadiness {
  configured: boolean;
  mode: 'official-api';
  missing: string[];
}

export interface TaobaoLiveRoom {
  broadcastId: string;
  title: string | null;
  broadcasterId: string | null;
  broadcasterName: string | null;
  status: string | null;
  viewerCount: number | null;
  likeCount: number | null;
  startedAt: Date | null;
  endedAt: Date | null;
  coverImageUrl: string | null;
  sourceUrl: string | null;
}

export interface TaobaoLiveProduct {
  broadcastId: string;
  productId: string;
  rank: number | null;
  title: string | null;
  priceCny: number | null;
  salesCount: number | null;
  imageUrl: string | null;
  sourceUrl: string | null;
}

export interface TaobaoLiveCollection {
  rooms: TaobaoLiveRoom[];
  products: TaobaoLiveProduct[];
  warnings: string[];
}

export interface TaobaoLivePort {
  readiness(): TaobaoLiveReadiness;
  collect(input: {
    queryDate: string;
    liveIds: string[];
    pageSize: number;
  }): Promise<TaobaoLiveCollection>;
}
