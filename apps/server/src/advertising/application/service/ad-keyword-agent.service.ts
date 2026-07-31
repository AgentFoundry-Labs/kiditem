// Keyword relevance classification.
//
// Runs one judgement per advertised product — "does this keyword fit?" is only
// answerable against a specific product, and the account carries thousands of
// keywords (7,613 across 42 products when this was built, one product alone
// holding 953). Judging them as one flat list would give the model no product
// to compare against and would not fit a prompt anyway.
//
// Everything the model returns is validated in `domain/ad-keyword-relevance`
// before it becomes anything: unknown refs, drifted keywords, missing
// rationale, and keywords that converted are all rejected. Surviving
// `irrelevant` verdicts become `pause_keyword` proposals in `pending_review`.
// Nothing here pauses an ad — approval and execution stay with the operator.

import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  buildKeywordJudgementPrompt,
  buildKeywordProductBatches,
  chunkKeywordProductBatch,
  KEYWORD_RELEVANCE_SYSTEM_PROMPT,
  parseKeywordRelevanceVerdicts,
  toKeywordPauseCandidates,
  type KeywordJudgementSource,
  type KeywordProductBatch,
  type KeywordRelevanceVerdict,
} from '../../domain/ad-keyword-relevance';
import { normalizeAdKeywordOrigin } from '../../domain/ad-keyword';
import {
  AD_ACTION_REPOSITORY_PORT,
  type AdActionRepositoryPort,
  type LatestTargetRow,
} from '../port/out/repository/ad-action.repository.port';
import {
  KEYWORD_RELEVANCE_JUDGE_PORT,
  type KeywordRelevanceJudgePort,
} from '../port/out/cross-domain/keyword-relevance-judge.port';
import {
  OPERATION_ALERT_PORT,
  type OperationAlertPort,
} from '../port/out/cross-domain/operation-alert.port';

/** Per-product cap. Above this the tail is single-impression noise. */
const MAX_KEYWORDS_PER_PRODUCT = 400;
/**
 * Keywords per model call. A single 400-keyword ask exceeded the provider's
 * 120s timeout on the live account, so a product is judged in chunks.
 */
const MAX_KEYWORDS_PER_CALL = 100;
/** Products judged in one pass; the rest are reported as pending. */
const MAX_PRODUCTS_PER_RUN = 40;

export interface KeywordRelevanceRunResult {
  ok: boolean;
  reason: string;
  judgedProductCount: number;
  judgedKeywordCount: number;
  irrelevantCount: number;
  created: number;
  failedProductCount: number;
  skippedProductCount: number;
  truncatedKeywordCount: number;
  rejected: { ref: string; reason: string }[];
}

@Injectable()
export class AdKeywordAgentService {
  private readonly logger = new Logger(AdKeywordAgentService.name);

  constructor(
    @Inject(AD_ACTION_REPOSITORY_PORT)
    private readonly actionRepo: AdActionRepositoryPort,
    @Inject(KEYWORD_RELEVANCE_JUDGE_PORT)
    private readonly judge: KeywordRelevanceJudgePort,
    @Inject(OPERATION_ALERT_PORT)
    private readonly operationAlerts: OperationAlertPort,
  ) {}

  /**
   * Classify every collected keyword against the product it is advertising.
   *
   * `externalOptionId` narrows the run to one product, which is what the
   * per-product button in the keyword view uses.
   */
  async run(input: {
    organizationId: string;
    triggeredByUserId: string | null;
    externalOptionId?: string | null;
  }): Promise<KeywordRelevanceRunResult> {
    const rows = await this.actionRepo.findLatestTargetRows(input.organizationId);
    const sources = rows
      .filter((row) => row.targetType === 'keyword')
      .filter(
        (row) =>
          !input.externalOptionId ||
          row.externalOptionId === input.externalOptionId,
      )
      .map((row) => toJudgementSource(row));

    const { batches, sourceByRef, skippedProductCount } =
      buildKeywordProductBatches(sources, {
        maxKeywordsPerProduct: MAX_KEYWORDS_PER_PRODUCT,
        maxProducts: input.externalOptionId ? 1 : MAX_PRODUCTS_PER_RUN,
      });

    if (batches.length === 0) {
      return emptyResult(
        '판정할 광고 키워드가 없습니다. 대시보드에서 광고 키워드 수집을 먼저 실행해 주세요.',
      );
    }

    const verdicts: KeywordRelevanceVerdict[] = [];
    let failedProductCount = 0;
    let judgedKeywordCount = 0;
    let truncatedKeywordCount = 0;

    for (const batch of batches) {
      judgedKeywordCount += batch.items.length;
      truncatedKeywordCount += batch.truncatedCount;
      let productFailed = false;
      for (const chunk of chunkKeywordProductBatch(batch, MAX_KEYWORDS_PER_CALL)) {
        try {
          verdicts.push(...(await this.judgeBatch(chunk)));
        } catch (error) {
          // One chunk failing must not lose the verdicts already collected,
          // for this product or any earlier one.
          productFailed = true;
          this.logger.warn(
            `keyword relevance judgement failed for ${batch.productKey}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      if (productFailed) failedProductCount += 1;
    }

    if (verdicts.length === 0 && failedProductCount === batches.length) {
      return {
        ...emptyResult('키워드 연관성 판정에 실패했습니다. 모델 설정을 확인해 주세요.'),
        judgedProductCount: batches.length,
        judgedKeywordCount,
        failedProductCount,
      };
    }

    const { candidates, rejected } = toKeywordPauseCandidates(
      verdicts,
      sourceByRef,
    );
    if (rejected.length > 0) {
      this.logger.warn(
        `keyword relevance verdicts rejected: ${rejected
          .map((entry) => `${entry.ref}:${entry.reason}`)
          .join(', ')}`,
      );
    }

    const created =
      candidates.length > 0
        ? (
            await this.actionRepo.createAdActionsFromCandidates(
              input.organizationId,
              candidates,
            )
          ).length
        : 0;

    if (created > 0) {
      await this.operationAlerts
        .start({
          organizationId: input.organizationId,
          operationKey: `ad-keyword-relevance:${Date.now()}`,
          type: 'ad_keyword',
          title: `연관 없는 광고 키워드 ${created}건 승인 대기`,
          sourceType: 'ad_keyword_relevance',
          sourceId: null,
          actorUserId: input.triggeredByUserId,
          href: '/ad-ops',
          metadata: {
            judgedProductCount: batches.length,
            judgedKeywordCount,
            irrelevantCount: candidates.length,
          },
        })
        .catch((error) => {
          // The proposals are already stored; an alert failure must not undo
          // them or fail the request.
          this.logger.warn(
            `keyword relevance alert failed: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        });
    }

    return {
      ok: true,
      reason: buildRunSummary({
        created,
        judgedProductCount: batches.length,
        judgedKeywordCount,
        failedProductCount,
        skippedProductCount,
      }),
      judgedProductCount: batches.length,
      judgedKeywordCount,
      irrelevantCount: candidates.length,
      created,
      failedProductCount,
      skippedProductCount,
      truncatedKeywordCount,
      rejected,
    };
  }

  private async judgeBatch(
    batch: KeywordProductBatch,
  ): Promise<KeywordRelevanceVerdict[]> {
    const result = await this.judge.judge({
      system: KEYWORD_RELEVANCE_SYSTEM_PROMPT,
      user: buildKeywordJudgementPrompt(batch),
    });
    return parseKeywordRelevanceVerdicts(result.text);
  }
}

function toJudgementSource(row: LatestTargetRow): KeywordJudgementSource {
  return {
    adTargetDailyId: row.id,
    keyword: row.keyword ?? '',
    productName: row.productName,
    campaignName: row.campaignName,
    // Keyword ingest clears the option link when a keyword serves several
    // ads, so this is set only when the keyword names exactly one product.
    externalOptionId: row.externalOptionId,
    listingId: row.listingId,
    // `LatestTargetRow` carries no metaJson; a provider audit status is only
    // present on keywords the advertiser registered.
    origin: normalizeAdKeywordOrigin(
      typeof row.status === 'string' && row.status.trim().length > 0
        ? 'registered'
        : 'smart_targeting',
    ),
    impressions: row.impressions,
    clicks: row.clicks,
    spend: row.spend,
    revenue: row.revenue,
    conversions: row.conversions,
  };
}

function emptyResult(reason: string): KeywordRelevanceRunResult {
  return {
    ok: false,
    reason,
    judgedProductCount: 0,
    judgedKeywordCount: 0,
    irrelevantCount: 0,
    created: 0,
    failedProductCount: 0,
    skippedProductCount: 0,
    truncatedKeywordCount: 0,
    rejected: [],
  };
}

function buildRunSummary(input: {
  created: number;
  judgedProductCount: number;
  judgedKeywordCount: number;
  failedProductCount: number;
  skippedProductCount: number;
}): string {
  const parts = [
    `상품 ${input.judgedProductCount}개 · 키워드 ${input.judgedKeywordCount}개 판정`,
    input.created > 0
      ? `연관 없음 ${input.created}건을 승인 대기로 올렸습니다.`
      : '연관 없는 키워드는 없었습니다.',
  ];
  // Never let a partial run read as a complete one.
  if (input.failedProductCount > 0) {
    parts.push(`실패 ${input.failedProductCount}개 상품`);
  }
  if (input.skippedProductCount > 0) {
    parts.push(`남은 상품 ${input.skippedProductCount}개는 다시 실행해 주세요.`);
  }
  return parts.join(' — ');
}
