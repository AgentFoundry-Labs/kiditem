export const SHORTSTREND_TREND_PORT = Symbol('SHORTSTREND_TREND_PORT');

export interface ShortstrendTrendItem {
  videoKey: string;
  title: string | null;
  channelName: string | null;
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  keyword: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  rank: number | null;
}

export interface FetchShortstrendTrendingInput {
  keywords?: string[];
  limit?: number;
  publishedWithinDays?: number;
}

export interface FetchShortstrendTrendingResult {
  source: 'shortstrend' | 'youtube';
  generatedAt: string;
  items: ShortstrendTrendItem[];
  error?: string;
}

export interface ShortstrendTrendPort {
  fetchTrending(input: FetchShortstrendTrendingInput): Promise<FetchShortstrendTrendingResult>;
}
