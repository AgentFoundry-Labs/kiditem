import { Inject, Injectable } from '@nestjs/common';
import {
  SourcingKeywordAnalysisInputSchema, SourcingKeywordAnalysisSnapshotSchema,
  type SourcingKeywordAnalysisInput, type SourcingKeywordAnalysisSnapshot,
} from '@kiditem/shared/sourcing';
import {
  SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT, SOURCING_NAVER_DATALAB_TREND_PORT,
  SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT, SOURCING_NAVER_KEYWORD_RESEARCH_PORT,
  type NaverAutocompleteKeywordPort, type NaverDatalabPopularKeywordBoard,
  type NaverDatalabPopularKeywordPort, type NaverDatalabTrendPort, type NaverKeywordResearchPort,
  type CompareNaverDatalabSearchTrendsResult, type SearchNaverDatalabPopularKeywordsResult,
  type SearchNaverAutocompleteKeywordsResult,
} from '../port/out/provider/naver-keyword-research.port';
import { TREND_COLLECTION_REPOSITORY_PORT, type TrendCollectionRepositoryPort } from '../port/out/repository/trend-collection.repository.port';
import { SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT, type SourcingBrowserSourceAttemptRepositoryPort,
  type SourcingBrowserSourceAttempt } from '../port/out/repository/sourcing-browser-source-attempt.repository.port';
import { hashCollectionRequest } from './sourcing-collection-mappers';
import { requireIdempotencyKey } from './sourcing-source-attempt-primitives';
import type { AuthorizedCollectionOutput } from '../port/out/repository/sourcing-collection.repository.port';

const SOURCE = 'naver.keyword_analysis';
const VERSION = 'naver-keyword-analysis/v1';
const MAX_ANALYSIS_SEEDS = 12;
const MAX_ANALYSIS_AUTOCOMPLETE_SEEDS = 5;
const MAX_ANALYSIS_TREND_KEYWORDS = 40;
type KeywordAnalysisInput = SourcingKeywordAnalysisInput;
export type NaverKeywordAnalysisSnapshotPayload = SourcingKeywordAnalysisSnapshot;
export interface NaverKeywordAnalysisCollectionControls { signal?: AbortSignal }

@Injectable()
export class NaverKeywordResearchService {
  constructor(
    @Inject(SOURCING_NAVER_KEYWORD_RESEARCH_PORT) private readonly keywordResearch: NaverKeywordResearchPort,
    @Inject(SOURCING_NAVER_DATALAB_TREND_PORT) private readonly datalabTrend: NaverDatalabTrendPort,
    @Inject(SOURCING_NAVER_DATALAB_POPULAR_KEYWORD_PORT) private readonly popularKeywords: NaverDatalabPopularKeywordPort,
    @Inject(SOURCING_NAVER_AUTOCOMPLETE_KEYWORD_PORT) private readonly autocompleteKeywords: NaverAutocompleteKeywordPort,
    @Inject(TREND_COLLECTION_REPOSITORY_PORT) private readonly trendRepo: TrendCollectionRepositoryPort,
    @Inject(SOURCING_BROWSER_SOURCE_ATTEMPT_REPOSITORY_PORT) private readonly attempts: SourcingBrowserSourceAttemptRepositoryPort,
  ) {}

  async collectAnalysis(input: {
    organizationId: string; input: Record<string, unknown>; idempotencyKey: string;
    requestedByUserId?: string | null; signal?: AbortSignal;
  }) {
    const normalized = SourcingKeywordAnalysisInputSchema.parse(input.input);
    const inputHash = hashCollectionRequest(normalized);
    const failureAlert = sourceFailureAlert(inputHash);
    input.signal?.throwIfAborted();
    const { attempt, created } = await this.attempts.beginAttempt({ organizationId: input.organizationId,
      sourceKey: SOURCE, scopeKey: 'default', targetKey: inputHash,
      idempotencyKey: requireIdempotencyKey(input.idempotencyKey ?? ''), requestFingerprint: inputHash,
      plan: { source: SOURCE, input: normalized }, planChecksum: inputHash,
      requestedByUserId: input.requestedByUserId ?? null, collectorKey: 'naver-keyword-analysis',
      collectorVersion: VERSION, triggerKind: 'manual', expiresInMs: 15 * 60_000, failureAlert,
    });
    if (!created) return { attempt, payload: attempt.state === 'COMPLETE'
      ? await this.trendRepo.findKeywordAnalysisSnapshot({ organizationId: input.organizationId, inputHash, attemptId: attempt.attemptId }) : null };
    try {
      const result = await this.collectAnalysisProviders(normalized, input);
      input.signal?.throwIfAborted();
      const errors = result.popular?.boards.flatMap((board) => board.error ? [board.error] : []) ?? [];
      if (errors.length) throw new Error(errors.join('; '));
      const capturedAt = new Date();
      const payload = SourcingKeywordAnalysisSnapshotSchema.parse({ version: VERSION,
        generatedAt: capturedAt.toISOString(), input: normalized, result });
      const complete = await this.attempts.completeAttempt({ organizationId: input.organizationId,
        attemptId: attempt.attemptId, attemptToken: attempt.attemptToken, planChecksum: attempt.planChecksum,
        contentChecksum: hashCollectionRequest(payload), output: analysisOutput(input.organizationId, attempt, payload),
        sourceWindowEndAt: capturedAt });
      return { attempt: complete, payload: complete.state === 'COMPLETE' ? payload : null };
    } catch (error) {
      const failed = await this.attempts.failAttempt({ organizationId: input.organizationId,
        attemptId: attempt.attemptId, attemptToken: attempt.attemptToken,
        code: input.signal?.aborted ? 'SOURCE_COLLECTION_CANCELLED' : 'SOURCE_COLLECTION_FAILED',
        message: error instanceof Error ? error.message : String(error) });
      input.signal?.throwIfAborted();
      return { attempt: failed, payload: null };
    }
  }

  getAnalysisSnapshot(organizationId: string, rawInput: Record<string, unknown>) {
    const normalized = SourcingKeywordAnalysisInputSchema.parse(rawInput);
    return this.trendRepo.findKeywordAnalysisSnapshot({ organizationId, inputHash: hashCollectionRequest(normalized) });
  }

  status(organizationId: string, rawInput: Record<string, unknown>) {
    const inputHash = hashCollectionRequest(SourcingKeywordAnalysisInputSchema.parse(rawInput));
    return this.attempts.readSourceStatus({ organizationId, sourceKey: SOURCE, scopeKey: 'default',
      targetKey: inputHash, currentPlanChecksum: inputHash });
  }

  private async collectAnalysisProviders(
    input: KeywordAnalysisInput,
    controls: NaverKeywordAnalysisCollectionControls,
  ): Promise<NaverKeywordAnalysisSnapshotPayload['result']> {
    let popular: SearchNaverDatalabPopularKeywordsResult | null = null;
    let related: NaverKeywordAnalysisSnapshotPayload['result']['related'] = null;
    let autocomplete: SearchNaverAutocompleteKeywordsResult[] = [];
    let trends: CompareNaverDatalabSearchTrendsResult | null = null;

    if (input.action === 'popular' || input.action === 'trend_agent') {
      popular = await this.popularKeywords.searchPopularKeywords({
        timeUnit: input.timeUnit,
        gender: input.gender === 'all' ? undefined : input.gender,
        device: input.device === 'all' ? undefined : input.device,
        ages: input.age === 'all' ? undefined : [input.age],
        limit: input.rankLimit,
        signal: controls.signal,
      });
      controls.signal?.throwIfAborted();
    }

    const relatedSeed = input.action === 'related'
      ? [input.keyword as string]
      : input.action === 'trend_agent'
        ? collectAnalysisSeeds(popular?.boards ?? [], input)
        : [];
    if (relatedSeed.length > 0) {
      const providerRelated = await this.keywordResearch.searchRelatedKeywords({
        seedKeywords: relatedSeed,
        maxResults: 100,
        signal: controls.signal,
      });
      related = {
        ...providerRelated,
        items: providerRelated.items.map(({ raw: _providerRaw, ...item }) => item),
      };
      controls.signal?.throwIfAborted();
      autocomplete = await Promise.all(
        relatedSeed.slice(0, MAX_ANALYSIS_AUTOCOMPLETE_SEEDS).map((keyword) =>
          this.autocompleteKeywords.searchAutocompleteKeywords({
            keyword,
            maxResults: 30,
            signal: controls.signal,
          }),
        ),
      );
      controls.signal?.throwIfAborted();
    }

    const trendKeywords = input.action === 'compare'
      ? input.keywords ?? []
      : input.action === 'related'
        ? (related?.items ?? []).map((item) => item.keyword).slice(0, MAX_ANALYSIS_TREND_KEYWORDS)
        : input.action === 'trend_agent'
          ? uniqueKeywords([
            ...relatedSeed,
            ...(related?.items ?? []).map((item) => item.keyword),
            ...autocomplete.flatMap((item) => item.items.map((candidate) => candidate.keyword)),
          ]).slice(0, MAX_ANALYSIS_TREND_KEYWORDS)
          : [];
    if (trendKeywords.length > 0) {
      trends = await this.datalabTrend.compareSearchTrends({
        keywords: trendKeywords,
        timeUnit: input.timeUnit,
        gender: input.gender === 'all' ? undefined : input.gender,
        device: input.device === 'all' ? undefined : input.device,
        ages: toSearchTrendAges(input.age),
        signal: controls.signal,
      });
      controls.signal?.throwIfAborted();
    }

    return { popular, related, autocomplete, trends };
  }

}

function sourceFailureAlert(inputHash: string) {
  return {
    sourceType: SOURCE,
    dedupeKey: `source:${SOURCE}:${inputHash}`,
    title: '네이버 키워드 분석 수집 실패',
    href: '/sourcing-ai/keywords',
  };
}

function analysisOutput(organizationId: string, attempt: SourcingBrowserSourceAttempt,
  payload: NaverKeywordAnalysisSnapshotPayload): AuthorizedCollectionOutput {
  const capturedAt = new Date(payload.generatedAt);
  const payloadHash = hashCollectionRequest(payload);
  const observationKey = hashCollectionRequest({ attemptId: attempt.attemptId, payloadHash });
  return { observations: [{ organizationId, ingestionRunId: attempt.attemptId, sourceKey: SOURCE,
    platform: 'naver', evidenceFamily: 'keyword_analysis', signalRole: 'demand',
    granularity: 'aggregate_official', conceptKey: attempt.targetKey, supportsCandidate: false,
    sourceEntityType: 'keyword_analysis_snapshot', sourceEntityId: attempt.targetKey, schemaVersion: VERSION,
    observationKey, revision: 1,
    sourceUrl: null, eventAt: capturedAt, observedAt: capturedAt, availableAt: capturedAt, revisionAt: null,
    payloadHash, rawPayload: payload, ingestedAt: capturedAt,
  }], typedRecords: [{
    kind: 'naver_keyword_analysis_snapshot',
    row: {
      organizationId,
      ingestionRunId: attempt.attemptId,
      evidenceObservationKey: observationKey,
      evidenceRevision: 1,
      schemaVersion: VERSION,
      inputHash: attempt.targetKey,
      document: SourcingKeywordAnalysisSnapshotSchema.parse(payload),
      capturedAt,
    },
  }], discoveredCount: 1, rejectedCount: 0, qualityReport: { completeSnapshot: true } };
}

function collectAnalysisSeeds(
  boards: NaverDatalabPopularKeywordBoard[],
  input: KeywordAnalysisInput,
): string[] {
  const candidates = boards
    .filter((board) => input.selectedBoardKey === 'all' || board.key === input.selectedBoardKey)
    .filter((board) => matchesKeywordAnalysisFocus(board.key, input.focusMode))
    .flatMap((board) => board.ranks
      .filter((rank) => rank.rank <= input.rankLimit)
      .map((rank) => rank.keyword));
  return uniqueKeywords(candidates).slice(0, MAX_ANALYSIS_SEEDS);
}

function matchesKeywordAnalysisFocus(
  boardKey: string,
  focusMode: KeywordAnalysisInput['focusMode'],
): boolean {
  if (focusMode === 'all') return true;
  if (focusMode === 'toy_stationery') {
    return /toy|fancy|stationery/.test(boardKey);
  }
  return /birth|kids|toy|fancy|stationery/.test(boardKey);
}

function uniqueKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of keywords) {
    const keyword = value.trim();
    const key = keyword.replace(/\s+/g, '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(keyword);
  }
  return result;
}

function toSearchTrendAges(age: string): string[] | undefined {
  const mapped: Record<string, string[]> = {
    '10': ['2'],
    '20': ['3', '4'],
    '30': ['5', '6'],
    '40': ['7', '8'],
    '50': ['9', '10'],
    '60': ['11'],
  };
  return mapped[age];
}
