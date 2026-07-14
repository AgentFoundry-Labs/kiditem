import type { ShortstrendTrendItem } from '../../../application/port/out/provider/shortstrend-trend.port';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_SEARCH_KEYWORDS = 10;
const SEARCH_RESULTS_PER_KEYWORD = 25;
const VIDEO_BATCH_SIZE = 50;
const MAX_SHORT_DURATION_SECONDS = 4 * 60;

interface YoutubeSearchItem {
  id?: { videoId?: unknown };
  snippet?: {
    title?: unknown;
    channelTitle?: unknown;
    publishedAt?: unknown;
    thumbnails?: Record<string, { url?: unknown }>;
  };
}

interface YoutubeVideoItem {
  id?: unknown;
  statistics?: {
    viewCount?: unknown;
    likeCount?: unknown;
    commentCount?: unknown;
  };
  contentDetails?: { duration?: unknown };
}

interface SearchCandidate {
  videoId: string;
  keyword: string;
  title: string | null;
  channelName: string | null;
  publishedAt: string | null;
  thumbnailUrl: string | null;
}

interface RankedCandidate extends SearchCandidate {
  viewCount: number | null;
  likeCount: number | null;
  commentCount: number | null;
  score: number;
}

export interface FetchYoutubeShortsTrendingInput {
  apiKey: string;
  keywords: string[];
  publishedWithinDays: number;
  limit: number;
}

export async function fetchYoutubeShortsTrending(
  input: FetchYoutubeShortsTrendingInput,
): Promise<ShortstrendTrendItem[]> {
  const keywords = uniqueKeywords(input.keywords).slice(0, MAX_SEARCH_KEYWORDS);
  if (keywords.length === 0) return [];

  const cutoff = new Date(
    Date.now() - clampInteger(input.publishedWithinDays, 1, 90) * 24 * 60 * 60 * 1000,
  ).toISOString();
  const candidates = new Map<string, SearchCandidate>();

  for (const keyword of keywords) {
    const items = await searchYoutube({ apiKey: input.apiKey, keyword, cutoff });
    for (const item of items) {
      const candidate = toSearchCandidate(item, keyword);
      if (!candidate || candidates.has(candidate.videoId)) continue;
      candidates.set(candidate.videoId, candidate);
    }
  }

  const statistics = new Map<string, YoutubeVideoItem>();
  const ids = Array.from(candidates.keys());
  for (let index = 0; index < ids.length; index += VIDEO_BATCH_SIZE) {
    const batch = ids.slice(index, index + VIDEO_BATCH_SIZE);
    const items = await fetchVideoStatistics(input.apiKey, batch);
    for (const item of items) {
      const videoId = stringValue(item.id);
      if (videoId) statistics.set(videoId, item);
    }
  }

  const ranked = Array.from(candidates.values())
    .map((candidate) => enrichCandidate(candidate, statistics.get(candidate.videoId)))
    .filter((candidate): candidate is RankedCandidate => candidate !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, clampInteger(input.limit, 1, 200));

  return ranked.map((candidate, index) => ({
    videoKey: candidate.videoId,
    title: candidate.title,
    channelName: candidate.channelName,
    viewCount: candidate.viewCount,
    likeCount: candidate.likeCount,
    commentCount: candidate.commentCount,
    keyword: candidate.keyword,
    publishedAt: candidate.publishedAt,
    thumbnailUrl: candidate.thumbnailUrl,
    videoUrl: `https://www.youtube.com/shorts/${candidate.videoId}`,
    rank: index + 1,
  }));
}

async function searchYoutube(input: {
  apiKey: string;
  keyword: string;
  cutoff: string;
}): Promise<YoutubeSearchItem[]> {
  const url = new URL(`${YOUTUBE_API_BASE}/search`);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('q', input.keyword);
  url.searchParams.set('order', 'viewCount');
  url.searchParams.set('publishedAfter', input.cutoff);
  url.searchParams.set('videoDuration', 'short');
  url.searchParams.set('regionCode', 'KR');
  url.searchParams.set('relevanceLanguage', 'ko');
  url.searchParams.set('safeSearch', 'moderate');
  url.searchParams.set('maxResults', String(SEARCH_RESULTS_PER_KEYWORD));
  url.searchParams.set('key', input.apiKey);
  const payload = await fetchYoutubeJson(url);
  return Array.isArray(payload.items) ? payload.items as YoutubeSearchItem[] : [];
}

async function fetchVideoStatistics(apiKey: string, videoIds: string[]): Promise<YoutubeVideoItem[]> {
  if (videoIds.length === 0) return [];
  const url = new URL(`${YOUTUBE_API_BASE}/videos`);
  url.searchParams.set('part', 'statistics,contentDetails');
  url.searchParams.set('id', videoIds.join(','));
  url.searchParams.set('maxResults', String(videoIds.length));
  url.searchParams.set('key', apiKey);
  const payload = await fetchYoutubeJson(url);
  return Array.isArray(payload.items) ? payload.items as YoutubeVideoItem[] : [];
}

async function fetchYoutubeJson(url: URL): Promise<Record<string, unknown>> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`YouTube API 요청 실패: ${errorMessage(error)}`);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const detail = body.slice(0, 240).replace(/\s+/g, ' ').trim();
    throw new Error(`YouTube API 응답 오류 (${response.status})${detail ? `: ${detail}` : ''}`);
  }
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('YouTube API 응답 형식이 올바르지 않습니다.');
  }
  return payload as Record<string, unknown>;
}

function toSearchCandidate(item: YoutubeSearchItem, keyword: string): SearchCandidate | null {
  const videoId = stringValue(item.id?.videoId);
  if (!videoId) return null;
  const thumbnails = item.snippet?.thumbnails ?? {};
  const thumbnailUrl = ['maxres', 'standard', 'high', 'medium', 'default']
    .map((key) => stringValue(thumbnails[key]?.url))
    .find((value): value is string => value !== null) ?? null;
  return {
    videoId,
    keyword,
    title: stringValue(item.snippet?.title),
    channelName: stringValue(item.snippet?.channelTitle),
    publishedAt: normalizeIso(item.snippet?.publishedAt),
    thumbnailUrl,
  };
}

function enrichCandidate(
  candidate: SearchCandidate,
  video: YoutubeVideoItem | undefined,
): RankedCandidate | null {
  if (!video) return null;
  const durationSeconds = parseIsoDurationSeconds(stringValue(video.contentDetails?.duration));
  if (durationSeconds === null || durationSeconds > MAX_SHORT_DURATION_SECONDS) return null;
  const viewCount = parseInteger(video.statistics?.viewCount);
  const likeCount = parseInteger(video.statistics?.likeCount);
  const commentCount = parseInteger(video.statistics?.commentCount);
  const ageHours = candidate.publishedAt
    ? Math.max((Date.now() - Date.parse(candidate.publishedAt)) / (60 * 60 * 1000), 1)
    : 24;
  const viewsPerHour = (viewCount ?? 0) / ageHours;
  const engagementRate = viewCount && viewCount > 0
    ? ((likeCount ?? 0) + (commentCount ?? 0)) / viewCount
    : 0;
  return {
    ...candidate,
    viewCount,
    likeCount,
    commentCount,
    score: viewsPerHour * (1 + Math.min(engagementRate, 0.25)),
  };
}

function parseIsoDurationSeconds(value: string | null): number | null {
  if (!value) return null;
  const match = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(value);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function parseInteger(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(stringValue(value));
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : null;
}

function normalizeIso(value: unknown): string | null {
  const text = stringValue(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function uniqueKeywords(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
