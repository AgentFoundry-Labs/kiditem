import { apiClient } from '@/lib/api-client';
import type { SnsTrendVideo, TrendOpportunity } from './market-intelligence';

// 백엔드 `/api/sourcing/trend/shorts` (trend-query.service.ts ShortsTrendView) 응답 미러.
// 유튜브 쇼츠 트렌드는 shortstrend(공개 Supabase youtube_videos)를 우리 일별 스냅샷으로
// 적재한 것이라, 다일 수집이 쌓이면 viewDelta/dailyViewGrowth 실측 성장률이 채워진다.
interface ShortsTrendView {
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
  snapshotCount: number;
  viewDelta: number | null;
  dailyViewGrowth: number | null;
}

interface ShortsTrendResponse {
  days: number;
  businessDate: string | null;
  capturedAt: string | null;
  items: ShortsTrendView[];
}

export interface LiveSnsMarketResult {
  source: 'youtube-shorts-live';
  generatedAt: string;
  businessDate: string | null;
  opportunities: TrendOpportunity[];
  warnings: string[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FRESH_WINDOW_DAYS = 7;
const MAX_KEYWORDS = 20;
const MAX_TOP_VIDEOS = 3;

/**
 * 유튜브 쇼츠(shortstrend) 스냅샷을 키워드 단위로 집계해 SNS 급상승 후보를 만든다.
 * SNS지수 = 조회량 70% + 조회 속도 30% 정규화(0~100). 모멘텀 = 다일 실측 성장률이
 * 있으면 그 값, 없으면 조회 속도 기반 주간 성장 추정(수집이 누적되면 실측으로 전환).
 */
export async function fetchLiveSnsMarket(): Promise<LiveSnsMarketResult> {
  const response = await apiClient.get<ShortsTrendResponse>(
    '/api/sourcing/trend/shorts?days=7',
  );
  return buildLiveSnsMarketResult(response, Date.now());
}

interface KeywordAggregate {
  keyword: string;
  videoCount: number;
  totalViews: number;
  totalEngagement: number;
  totalVelocity: number;
  freshViews: number;
  measuredGrowth: number;
  hasMeasured: boolean;
  topVideos: SnsTrendVideo[];
}

export function buildLiveSnsMarketResult(
  response: ShortsTrendResponse,
  now: number,
): LiveSnsMarketResult {
  const byKeyword = new Map<string, ShortsTrendView[]>();
  for (const item of response.items) {
    const keyword = item.keyword?.trim();
    if (!keyword || item.viewCount == null) continue;
    const bucket = byKeyword.get(keyword);
    if (bucket) bucket.push(item);
    else byKeyword.set(keyword, [item]);
  }

  const aggregates = [...byKeyword.entries()].map(([keyword, videos]) =>
    aggregateKeyword(keyword, videos, now),
  );
  const maxViews = Math.max(...aggregates.map((a) => a.totalViews), 1);
  const maxVelocity = Math.max(...aggregates.map((a) => a.totalVelocity), 1);

  const opportunities = aggregates
    .map((aggregate) => toOpportunity(aggregate, maxViews, maxVelocity))
    .sort((a, b) => (
      b.score - a.score
      || b.momentum - a.momentum
      || (b.snsEvidence?.totalViews ?? 0) - (a.snsEvidence?.totalViews ?? 0)
    ))
    .slice(0, MAX_KEYWORDS)
    .map((opportunity, index) => ({ ...opportunity, trendRank: index + 1 }));

  return {
    source: 'youtube-shorts-live',
    generatedAt: response.capturedAt ?? new Date(now).toISOString(),
    businessDate: response.businessDate,
    opportunities,
    warnings: [],
  };
}

function aggregateKeyword(keyword: string, videos: ShortsTrendView[], now: number): KeywordAggregate {
  let totalViews = 0;
  let totalEngagement = 0;
  let totalVelocity = 0;
  let freshViews = 0;
  let measuredGrowth = 0;
  let hasMeasured = false;

  for (const video of videos) {
    const views = video.viewCount ?? 0;
    totalViews += views;
    totalEngagement += (video.likeCount ?? 0) + (video.commentCount ?? 0);

    const ageDays = publishedAgeDays(video.publishedAt, now);
    totalVelocity += views / ageDays;
    if (ageDays <= FRESH_WINDOW_DAYS) freshViews += views;

    if (video.snapshotCount > 1 && video.viewDelta != null && video.viewDelta > 0) {
      measuredGrowth += video.viewDelta;
      hasMeasured = true;
    }
  }

  const topVideos: SnsTrendVideo[] = [...videos]
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, MAX_TOP_VIDEOS)
    .map((video) => ({
      title: video.title ?? '(제목 없음)',
      channelName: video.channelName,
      viewCount: video.viewCount,
      videoUrl: video.videoUrl,
    }));

  return {
    keyword,
    videoCount: videos.length,
    totalViews,
    totalEngagement,
    totalVelocity,
    freshViews,
    measuredGrowth,
    hasMeasured,
    topVideos,
  };
}

function toOpportunity(
  aggregate: KeywordAggregate,
  maxViews: number,
  maxVelocity: number,
): TrendOpportunity {
  const viewScore = (Math.log1p(aggregate.totalViews) / Math.log1p(maxViews)) * 100;
  const velocityScore = (Math.log1p(aggregate.totalVelocity) / Math.log1p(maxVelocity)) * 100;
  const score = Math.round(clamp(viewScore * 0.7 + velocityScore * 0.3, 0, 100));

  const momentum = aggregate.hasMeasured && aggregate.totalViews > aggregate.measuredGrowth
    ? round(clamp((aggregate.measuredGrowth / (aggregate.totalViews - aggregate.measuredGrowth)) * 100, 0, 999.9), 1)
    : round(clamp((aggregate.totalVelocity * 7 / Math.max(1, aggregate.totalViews)) * 100, 0, 999.9), 1);

  const freshShare = aggregate.totalViews > 0
    ? Math.round((aggregate.freshViews / aggregate.totalViews) * 100)
    : 0;

  const licensed = looksLikeLicensedKeyword(aggregate.keyword);
  const decision: TrendOpportunity['decision'] = licensed
    ? 'licensed'
    : score >= 75 && momentum >= 25
      ? 'focus'
      : momentum >= 50
        ? 'seasonal'
        : 'test';

  return {
    id: `live-sns-${compactKeyword(aggregate.keyword)}`,
    keyword: aggregate.keyword,
    category: classifyCategory(aggregate.keyword),
    trendRank: 0,
    previousTrendRank: null,
    score,
    decision,
    monthlySearches: null,
    shoppingRank: null,
    momentum,
    competition: '중간',
    sources: ['YOUTUBE'],
    evidence: `유튜브 쇼츠 ${formatCount(aggregate.videoCount)}개 · 총 조회 ${formatCount(aggregate.totalViews)} · 최근 7일 신작 조회 비중 ${freshShare}%${
      aggregate.hasMeasured ? ' · 다일 실측 성장 반영' : ' · 조회 속도 기반 추정(수집 누적 시 실측 전환)'
    }`,
    nextAction: licensed
      ? '캐릭터·IP 쇼츠일 수 있으니 정식 유통 증빙이 되는 SKU만 검토하세요.'
      : '조회가 몰린 쇼츠의 상품 구성을 확인하고 네이버·쿠팡 검색 수요와 교차 검증하세요.',
    points: [],
    snsEvidence: {
      videoCount: aggregate.videoCount,
      totalViews: aggregate.totalViews,
      freshShare,
      topVideos: aggregate.topVideos,
    },
  };
}

function publishedAgeDays(publishedAt: string | null, now: number): number {
  if (!publishedAt) return 30;
  const time = Date.parse(publishedAt);
  if (Number.isNaN(time)) return 30;
  return Math.max(1, (now - time) / DAY_MS);
}

function classifyCategory(keyword: string): 'toy' | 'stationery' {
  return /문구|스티커|키링|키홀더|필통|연필|펜|노트|다이어리|메모|지우개|가위|테이프|비즈|공예|만들기|색칠|다꾸/.test(keyword)
    ? 'stationery'
    : 'toy';
}

function looksLikeLicensedKeyword(keyword: string): boolean {
  return /포켓몬|산리오|티니핑|터닝메카드|헬로카봇|뽀로로|타요|브레드이발소|시크릿쥬쥬|또봇|레고|디즈니|마블|짱구|쿠로미|마이멜로디/i.test(keyword);
}

function compactKeyword(keyword: string): string {
  return keyword.replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

function formatCount(value: number): string {
  return value.toLocaleString('ko-KR');
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}
