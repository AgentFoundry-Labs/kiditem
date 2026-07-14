import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { matchStationeryToyTrend } from '../../../domain/stationery-toy-trend';
import type {
  FetchShortstrendTrendingInput,
  FetchShortstrendTrendingResult,
  ShortstrendTrendItem,
  ShortstrendTrendPort,
} from '../../../application/port/out/provider/shortstrend-trend.port';
import { fetchYoutubeShortsTrending } from './youtube-data-shorts.client';

const DEFAULT_SUPABASE_URL = 'https://jyddxxqftwzvnaakvxfz.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_tqQXZ6aOTzbaW8DMJU4YZg_RBb54S53';
const DEFAULT_TABLE = 'youtube_videos';
const REST_PATH = '/rest/v1';
const SELECT_COLUMNS = [
  'video_id',
  'title',
  'channel_title',
  'channel_id',
  'thumbnail_url',
  'view_count',
  'like_count',
  'comment_count',
  'category_name',
  'published_at',
  'collected_at',
  'trend_score',
].join(',');
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const DEFAULT_PUBLISHED_WITHIN_DAYS = 30;
const POOL_SIZE = 3_000;
// PostgREST/Supabase projects commonly cap one response at 1,000 rows even when
// a larger `limit` is requested. Page explicitly so the intended pool is real.
const REST_PAGE_SIZE = 1_000;
// shortstrend는 약 4시간 간격으로 수집 배치를 쌓는다. 문구·완구처럼 전체 쇼츠에서
// 비중이 작은 카테고리도 최대 20개 후보를 확보할 수 있도록 최근 48시간 풀을 사용한다.
const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
const CACHE_TTL_MS = 10 * 60 * 1000;

interface ShortstrendVideoRow {
  video_id?: unknown;
  title?: unknown;
  channel_title?: unknown;
  thumbnail_url?: unknown;
  view_count?: unknown;
  like_count?: unknown;
  comment_count?: unknown;
  category_name?: unknown;
  published_at?: unknown;
  collected_at?: unknown;
  trend_score?: unknown;
}

interface CachedTrending {
  expiresAt: number;
  value: FetchShortstrendTrendingResult;
}

@Injectable()
export class ShortstrendTrendAdapter implements ShortstrendTrendPort {
  private readonly cache = new Map<string, CachedTrending>();

  async fetchTrending(input: FetchShortstrendTrendingInput): Promise<FetchShortstrendTrendingResult> {
    const seeds = normalizeSeeds(input.keywords);
    const limit = clampInteger(input.limit ?? DEFAULT_LIMIT, 1, MAX_LIMIT);
    const publishedWithinDays = clampInteger(
      input.publishedWithinDays ?? DEFAULT_PUBLISHED_WITHIN_DAYS,
      1,
      90,
    );
    const youtubeApiKey = readYoutubeApiKey();
    const cacheKey = `${youtubeApiKey ? 'youtube' : 'shortstrend'}:${publishedWithinDays}:${limit}:${seeds.join('')}`;
    const cached = this.readCache(cacheKey);
    if (cached) return cached;

    try {
      if (youtubeApiKey) {
        const items = await fetchYoutubeShortsTrending({
          apiKey: youtubeApiKey,
          keywords: seeds,
          publishedWithinDays,
          limit,
        });
        const result: FetchShortstrendTrendingResult = {
          source: 'youtube',
          generatedAt: new Date().toISOString(),
          items,
        };
        this.writeCache(cacheKey, result);
        return result;
      }

      const latestCollectedAt = await this.fetchLatestCollectedAt();
      if (!latestCollectedAt) {
        return { source: 'shortstrend', generatedAt: new Date().toISOString(), items: [] };
      }

      const rows = await this.fetchRecentRows(latestCollectedAt);
      const items = buildRankedItems(rows, seeds, limit);
      const result: FetchShortstrendTrendingResult = {
        source: 'shortstrend',
        generatedAt: new Date().toISOString(),
        items,
      };
      this.writeCache(cacheKey, result);
      return result;
    } catch (error) {
      return {
        source: 'shortstrend',
        generatedAt: new Date().toISOString(),
        items: [],
        error: errorMessage(error),
      };
    }
  }

  private async fetchLatestCollectedAt(): Promise<string | null> {
    const url = new URL(`${readBaseUrl()}${REST_PATH}/${readTable()}`);
    url.searchParams.set('select', 'collected_at');
    url.searchParams.set('order', 'collected_at.desc');
    url.searchParams.set('limit', '1');
    const rows = await this.fetchRows(url);
    const latest = rows[0]?.collected_at;
    return typeof latest === 'string' && latest.trim() ? latest : null;
  }

  private async fetchRecentRows(latestCollectedAt: string): Promise<ShortstrendVideoRow[]> {
    const cutoff = new Date(Date.parse(latestCollectedAt) - RECENT_WINDOW_MS).toISOString();
    const rows: ShortstrendVideoRow[] = [];

    while (rows.length < POOL_SIZE) {
      const pageSize = Math.min(REST_PAGE_SIZE, POOL_SIZE - rows.length);
      const url = new URL(`${readBaseUrl()}${REST_PATH}/${readTable()}`);
      url.searchParams.set('select', SELECT_COLUMNS);
      url.searchParams.set('collected_at', `gte.${cutoff}`);
      // 먼저 최신 배치를 충분히 확보한 뒤 아래에서 영상별 최신 행을 trend_score 순으로 재정렬한다.
      url.searchParams.set('order', 'collected_at.desc,trend_score.desc');
      url.searchParams.set('limit', String(pageSize));
      url.searchParams.set('offset', String(rows.length));

      const page = await this.fetchRows(url);
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    return rows;
  }

  private async fetchRows(url: URL): Promise<ShortstrendVideoRow[]> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: shortstrendHeaders(),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new Error(`shortstrend 요청 실패: ${errorMessage(error)}`);
    }

    if (!response.ok) {
      throw new Error(`shortstrend 응답 오류 (${response.status})`);
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      throw new Error('shortstrend가 JSON이 아닌 응답을 반환했습니다.');
    }
    if (!Array.isArray(parsed)) {
      throw new Error('shortstrend 응답 형식이 배열이 아닙니다.');
    }
    return parsed as ShortstrendVideoRow[];
  }

  private readCache(key: string): FetchShortstrendTrendingResult | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (cached.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return null;
    }
    return cached.value;
  }

  private writeCache(key: string, value: FetchShortstrendTrendingResult): void {
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value });
  }
}

function buildRankedItems(
  rows: ShortstrendVideoRow[],
  seeds: string[],
  limit: number,
): ShortstrendTrendItem[] {
  const deduped = dedupeByVideoKey(rows).sort(byTrendScoreDesc);
  const selected = deduped
    .map((row) => ({ row, keyword: matchRelevantKeyword(row, seeds) }))
    .filter((entry): entry is { row: ShortstrendVideoRow; keyword: string } => entry.keyword != null)
    .slice(0, limit);

  return selected.map(({ row, keyword }, index) => toItem(row, index + 1, keyword));
}

function dedupeByVideoKey(rows: ShortstrendVideoRow[]): ShortstrendVideoRow[] {
  const seen = new Set<string>();
  const result: ShortstrendVideoRow[] = [];
  for (const row of rows) {
    const videoId = stringValue(row.video_id);
    const key = videoId ?? `${stringValue(row.title) ?? ''}`;
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    result.push(row);
  }
  return result;
}

function byTrendScoreDesc(a: ShortstrendVideoRow, b: ShortstrendVideoRow): number {
  return numericValue(b.trend_score) - numericValue(a.trend_score);
}

function numericValue(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toItem(row: ShortstrendVideoRow, rank: number, keyword: string | null): ShortstrendTrendItem {
  const videoId = stringValue(row.video_id);
  const videoUrl = videoId ? `https://www.youtube.com/shorts/${videoId}` : null;
  const title = stringValue(row.title);
  const videoKey = videoId ?? parseVideoId(videoUrl) ?? stableKey(title, rank);
  return {
    videoKey,
    title,
    channelName: stringValue(row.channel_title),
    viewCount: parseCount(row.view_count),
    likeCount: parseCount(row.like_count),
    commentCount: parseCount(row.comment_count),
    keyword,
    publishedAt: normalizeIso(row.published_at),
    thumbnailUrl: stringValue(row.thumbnail_url),
    videoUrl,
    rank,
  };
}

function matchRelevantKeyword(row: ShortstrendVideoRow, seeds: string[]): string | null {
  return matchStationeryToyTrend(
    [stringValue(row.title), stringValue(row.category_name)],
    seeds,
  );
}

function normalizeSeeds(keywords?: string[]): string[] {
  return Array.from(
    new Set((keywords ?? []).map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0)),
  );
}

function parseCount(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : null;
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;
  // 정규식 alternation 은 좌→우 매칭이라 '천만'을 '천'/'만'보다 먼저 두어야 '5천만'이 올바르게 잡힌다.
  const match = /^([0-9][0-9,]*(?:\.[0-9]+)?)\s*(억|천만|만|천|k|m)?/i.exec(text);
  if (!match) return null;
  const base = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const unit = (match[2] ?? '').toLowerCase();
  const multiplier =
    unit === '억'
      ? 100_000_000
      : unit === '천만'
        ? 10_000_000
        : unit === '만'
          ? 10_000
          : unit === '천'
            ? 1_000
            : unit === 'm'
              ? 1_000_000
              : unit === 'k'
                ? 1_000
                : 1;
  return Math.round(base * multiplier);
}

function normalizeIso(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  const time = Date.parse(text);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString();
}

function parseVideoId(url: string | null): string | null {
  if (!url) return null;
  return (
    /(?:youtube\.com\/shorts\/|youtu\.be\/|[?&]v=)([a-zA-Z0-9_-]{6,})/.exec(url)?.[1] ?? null
  );
}

function stableKey(title: string | null, rank: number): string {
  return `st_${createHash('sha1').update(`${title ?? ''}::${rank}`).digest('hex').slice(0, 16)}`;
}

function readBaseUrl(): string {
  return (process.env.SHORTSTREND_SUPABASE_URL?.trim() || DEFAULT_SUPABASE_URL).replace(/\/+$/, '');
}

function readTable(): string {
  return process.env.SHORTSTREND_TABLE?.trim() || DEFAULT_TABLE;
}

function readApiKey(): string {
  return process.env.SHORTSTREND_SUPABASE_KEY?.trim() || DEFAULT_SUPABASE_KEY;
}

function readYoutubeApiKey(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

function shortstrendHeaders(): HeadersInit {
  const key = readApiKey();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: 'application/json',
    'Accept-Profile': 'public',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
