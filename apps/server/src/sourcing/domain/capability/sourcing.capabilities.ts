import { z } from 'zod';
import type { CapabilityDefinition } from '../../../common/capability-definition';
import {
  parseAllowedSupplierUrl,
  SUPPLIER_URL_CATALOG_REGEXP,
  SUPPLIER_URL_MAX_LENGTH,
} from '../supplier-source-url-policy';

const Uuid = z.string().uuid();
const Identifier = z.string().trim().min(1).max(200);
const OperationStatus = z.enum(['queued', 'waiting_runtime', 'waiting_dependency', 'running', 'attention_required', 'succeeded', 'failed', 'cancelled', 'skipped']);
const OperationOutput = z.object({ operationRunId: Uuid, status: OperationStatus }).strict();
const SupplierUrl = z.string()
  .trim()
  .max(SUPPLIER_URL_MAX_LENGTH)
  .url()
  .regex(SUPPLIER_URL_CATALOG_REGEXP)
  .transform((value, context) => {
  try {
    return parseAllowedSupplierUrl(value).normalizedUrl;
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'supplier_url_invalid' });
    return z.NEVER;
  }
});
const SourceSnapshot = z.object({
  sourceUrl: SupplierUrl,
  platform: z.enum(['1688', 'alibaba']),
  title: z.string().trim().min(1).max(1_000).nullable(),
  price: z.number().nonnegative().nullable(),
  currency: z.string().trim().min(1).max(12).nullable(),
  variantKeyNormalized: z.string().trim().max(200),
  images: z.array(z.string().url().max(2_000)).max(40),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

/** Sourcing owns all ten final Agent-facing definitions and their strict business schemas. */
export const SOURCING_CAPABILITIES = [
  {
    key: 'sourcing.duplicateCheck', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.duplicateCheck',
    description: 'Check whether an approved supplier URL already has a sourcing candidate.',
    resultSummary: '중복 상품 여부를 확인했습니다.',
    inputSchema: z.object({ sourceUrl: SupplierUrl }).strict(),
    outputSchema: z.object({ duplicate: z.boolean(), candidateId: Uuid.nullable() }).strict(),
    effects: ['read'], approvalRisk: 'none', idempotency: 'recommended',
  },
  {
    key: 'sourcing.scrapeProductUrl', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.scrapeProductUrl',
    description: 'Read a bounded normalized source snapshot through the approved supplier browser boundary.',
    resultSummary: '상품 소스 정보를 확인했습니다.',
    inputSchema: z.object({ sourceUrl: SupplierUrl }).strict(),
    outputSchema: z.object({ snapshot: SourceSnapshot }).strict(),
    effects: ['browser', 'external_io'], approvalRisk: 'none', idempotency: 'recommended',
  },
  {
    key: 'sourcing.ingestCandidate', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.ingestCandidate',
    description: 'Persist the exact server-scraped source snapshot bound to the same live provider turn.',
    resultSummary: '상품 후보를 등록했습니다.',
    inputSchema: z.object({ snapshot: SourceSnapshot }).strict(),
    outputSchema: z.object({ candidateId: Uuid }).strict(),
    effects: ['db_write'], approvalRisk: 'low', idempotency: 'required',
  },
  {
    key: 'sourcing.scrapeUrlWorkflow', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.scrapeUrlWorkflow',
    description: 'Run the durable sourcing URL scrape and candidate-ingest workflow.',
    resultSummary: '상품 수집 작업을 처리했습니다.',
    inputSchema: z.object({ sourceUrl: SupplierUrl }).strict(),
    outputSchema: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('existing'), candidateId: Uuid }).strict(),
      z.object({ kind: z.literal('enqueued'), operationRunId: Uuid, status: OperationStatus }).strict(),
    ]),
    effects: ['read', 'browser', 'external_io', 'db_write', 'job_enqueue'], approvalRisk: 'low', idempotency: 'required',
  },
  {
    key: 'sourcing.retrieveWorkspaceEvidence', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.retrieveWorkspaceEvidence',
    description: 'Retrieve bounded, cited sourcing workspace evidence for a query.',
    resultSummary: '소싱 근거를 확인했습니다.',
    inputSchema: z.object({ query: z.string().trim().min(1).max(2_000), topK: z.number().int().min(1).max(12).optional(), days: z.number().int().min(1).max(30).optional() }).strict(),
    outputSchema: z.object({
      inputHash: z.string().regex(/^[a-f0-9]{64}$/), documentCount: z.number().int().nonnegative(),
      documents: z.array(z.object({
        documentId: Identifier,
        title: z.string().trim().min(1).max(500),
        text: z.string().trim().min(1).max(8_000),
        sourceScope: z.enum(['recommendation_run', 'interest_targets', 'validation']),
        sourceDate: z.union([
          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          z.string().datetime(),
        ]),
        sourceSnapshotId: Identifier,
      }).strict()).max(12),
      dataGaps: z.array(z.string().min(1).max(200)).max(20),
    }).strict(),
    effects: ['read'], approvalRisk: 'none', idempotency: 'recommended',
  },
  {
    key: 'sourcing.inspectRecommendationRun', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.inspectRecommendationRun',
    description: 'Read the exact requested run, or the latest eligible run when omitted, with its validation summary.',
    resultSummary: '추천 실행 결과를 확인했습니다.',
    inputSchema: z.object({ recommendationRunId: Uuid.optional() }).strict(),
    outputSchema: z.object({ runId: Identifier, status: z.enum(['complete', 'partial', 'failed']), businessDate: z.string().min(1), itemCount: z.number().int().nonnegative(), warningCodes: z.array(Identifier).max(20), validation: z.object({ itemCount: z.number().int().nonnegative(), missingCount: z.number().int().nonnegative() }).strict() }).strict(),
    effects: ['read'], approvalRisk: 'none', idempotency: 'recommended',
  },
  {
    key: 'sourcing.refreshCollection', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.refreshCollection',
    description: 'Enqueue durable source collection for selected approved market sources.',
    resultSummary: '시장 소스 수집을 시작했습니다.',
    inputSchema: z.object({ sources: z.array(z.enum(['naver', '1688', 'shorts'])).min(1).max(3) }).strict(), outputSchema: OperationOutput,
    effects: ['external_io', 'job_enqueue'], approvalRisk: 'low', idempotency: 'required',
  },
  {
    key: 'sourcing.refreshValidation', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.refreshValidation',
    description: 'Refresh bounded validation evidence for one recommendation run.',
    resultSummary: '추천 근거 검증을 갱신했습니다.',
    inputSchema: z.object({ recommendationRunId: Uuid }).strict(),
    outputSchema: z.object({ recommendationRunId: Uuid, validationEpisodeIds: z.array(Identifier), missingEvidence: z.array(z.string().min(1).max(500)) }).strict(),
    effects: ['db_write'], approvalRisk: 'low', idempotency: 'required',
  },
  {
    key: 'sourcing.createReviewBatch', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.createReviewBatch',
    description: 'Create a review batch from exact recommendation workspace item versions.',
    resultSummary: '검토 묶음을 만들었습니다.',
    inputSchema: z.object({ recommendationRunId: Uuid, workspaceKey: z.enum(['entry', 'final']), items: z.array(z.object({ itemKey: Identifier, expectedVersion: z.number().int().nonnegative() }).strict()).min(1).max(100) }).strict(),
    outputSchema: z.object({ reviewBatchId: Identifier, itemCount: z.number().int().nonnegative(), status: Identifier }).strict(),
    effects: ['db_write'], approvalRisk: 'low', idempotency: 'required',
  },
  {
    key: 'sourcing.collect_shadow_signals', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.collectShadowSignals',
    description: 'Enqueue durable collection of external market-shadow signals.',
    resultSummary: '시장 신호 수집을 시작했습니다.',
    inputSchema: z.object({}).strict(), outputSchema: OperationOutput,
    effects: ['external_io', 'job_enqueue'], approvalRisk: 'low', idempotency: 'required',
  },
] as const satisfies readonly CapabilityDefinition[];

export type SourcingCapabilityKey = (typeof SOURCING_CAPABILITIES)[number]['key'];
