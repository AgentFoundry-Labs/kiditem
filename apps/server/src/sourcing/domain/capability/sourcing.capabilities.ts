import { z } from 'zod';
import type { CapabilityDefinition } from '../../../common/capability-definition';
import {
  parseAllowedSupplierUrl,
  SUPPLIER_URL_CATALOG_REGEXP,
  SUPPLIER_URL_MAX_LENGTH,
} from '../supplier-source-url-policy';

const Uuid = z.string().uuid();
const Identifier = z.string().trim().min(1).max(200);
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

/** Sourcing owns its direct final Agent-facing definitions and strict business schemas. */
export const SOURCING_CAPABILITIES = [
  {
    key: 'sourcing.duplicateCheck', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.duplicateCheck',
    description:
      'Check whether an allowed supplier product URL (1688/Alibaba catalog form) already has a sourcing candidate in ' +
      'this organization; the result is duplicate true/false with the existing candidateId and the salesProductId of its ' +
      'draft (the product the operator opens). Call it before ' +
      'sourcing.scrapeProductUrl to avoid collecting the same offer twice. It reads only and does not normalize or ' +
      'validate the offer itself.',
    resultSummary: '중복 상품 여부를 확인했습니다.',
    inputSchema: z.object({ sourceUrl: SupplierUrl }).strict(),
    outputSchema: z.object({ duplicate: z.boolean(), candidateId: Uuid.nullable(), salesProductId: Uuid.nullable() }).strict(),
    effects: ['read'], approvalRisk: 'none', idempotency: 'recommended',
  },
  {
    key: 'sourcing.scrapeProductUrl', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.scrapeProductUrl',
    description:
      'Open an allowed supplier product URL in the approved browser boundary and return a normalized snapshot: ' +
      'title, price and currency, variant key, up to 40 image URLs and a content hash. Use it to inspect an offer ' +
      'before deciding to collect it; nothing is persisted, and the snapshot must be passed unchanged to ' +
      'sourcing.ingestCandidate to create the candidate.',
    resultSummary: '상품 소스 정보를 확인했습니다.',
    inputSchema: z.object({ sourceUrl: SupplierUrl }).strict(),
    outputSchema: z.object({ snapshot: SourceSnapshot }).strict(),
    effects: ['browser', 'external_io'], approvalRisk: 'none', idempotency: 'recommended',
  },
  {
    key: 'sourcing.ingestCandidate', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.ingestCandidate',
    description:
      'Persist a snapshot returned by sourcing.scrapeProductUrl in the same live provider turn as a sourcing candidate and its ' +
      'selling-product draft; the result is the candidateId and the draft salesProductId the operator opens. The snapshot ' +
      'must be passed back unchanged (the content ' +
      'hash is verified) and an offer that already has a candidate returns that candidate. It does not register ' +
      'anything on a mall.',
    resultSummary: '상품 후보를 등록했습니다.',
    inputSchema: z.object({ snapshot: SourceSnapshot }).strict(),
    outputSchema: z.object({ candidateId: Uuid, salesProductId: Uuid.nullable() }).strict(),
    effects: ['db_write'], approvalRisk: 'medium', idempotency: 'required',
  },
  {
    key: 'sourcing.retrieveWorkspaceEvidence', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.retrieveWorkspaceEvidence',
    description:
      'Retrieve up to topK cited documents (recommendation runs, interest targets, validation results) from the ' +
      'sourcing workspace that match a free-text query within the last N days, plus the data gaps the search could ' +
      'not cover. Use it to ground a sourcing judgment in stored evidence; it reads only and returns document ' +
      'excerpts with their snapshot ids, not full pages.',
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
    description:
      'Read one recommendation run by id, or the latest eligible run when no id is given: its status, business ' +
      'date, item count, warning codes and the validation summary (items validated, evidence missing). Use it before ' +
      'refreshing validation or creating a review batch; it reads only.',
    resultSummary: '추천 실행 결과를 확인했습니다.',
    inputSchema: z.object({ recommendationRunId: Uuid.optional() }).strict(),
    outputSchema: z.object({ runId: Identifier, status: z.enum(['complete', 'partial', 'failed']), businessDate: z.string().min(1), itemCount: z.number().int().nonnegative(), warningCodes: z.array(Identifier).max(20), validation: z.object({ itemCount: z.number().int().nonnegative(), missingCount: z.number().int().nonnegative() }).strict() }).strict(),
    effects: ['read'], approvalRisk: 'none', idempotency: 'recommended',
  },
  {
    key: 'sourcing.refreshValidation', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.refreshValidation',
    description:
      'Re-run bounded validation for one recommendation run and record the resulting validation episodes; the ' +
      'result lists the episode ids and the evidence still missing. Use it when sourcing.inspectRecommendationRun ' +
      'reports missing evidence; it does not change the recommendation items or create a review batch.',
    resultSummary: '추천 근거 검증을 갱신했습니다.',
    inputSchema: z.object({ recommendationRunId: Uuid }).strict(),
    outputSchema: z.object({ recommendationRunId: Uuid, validationEpisodeIds: z.array(Identifier), missingEvidence: z.array(z.string().min(1).max(500)) }).strict(),
    effects: ['db_write'], approvalRisk: 'low', idempotency: 'required',
  },
  {
    key: 'sourcing.createReviewBatch', ownerDomain: 'sourcing', ownerInputPort: 'sourcing.createReviewBatch',
    description:
      'Create a human review batch from 1-100 items of one recommendation run, each named by its item key and the ' +
      'expected version the caller read; the result is the batch id, item count and status. An item whose version ' +
      'moved is refused so a stale view is never queued. It does not approve or reject items and does not create ' +
      'candidates.',
    resultSummary: '검토 묶음을 만들었습니다.',
    inputSchema: z.object({ recommendationRunId: Uuid, workspaceKey: z.enum(['entry', 'final']), items: z.array(z.object({ itemKey: Identifier, expectedVersion: z.number().int().nonnegative() }).strict()).min(1).max(100) }).strict(),
    outputSchema: z.object({ reviewBatchId: Identifier, itemCount: z.number().int().nonnegative(), status: Identifier }).strict(),
    effects: ['db_write'], approvalRisk: 'low', idempotency: 'required',
  },
] as const satisfies readonly CapabilityDefinition[];

export type SourcingCapabilityKey = (typeof SOURCING_CAPABILITIES)[number]['key'];
