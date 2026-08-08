# Sourcing Backend and Data Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/sourcing-ai`의 14개 화면과 현재 사용자 기능을 유지하면서, 모든 소싱 수집·추천·검증·선택을 권한 선검사, 정규화된 PostgreSQL 상태, 서버 단일 scorer, 동시성 안전한 command로 전환한다.

**Architecture:** 기존 Web 화면과 배포된 Extension v1은 compatibility facade를 유지한다. 모든 신규 수집은 `SourcingCollectionCoordinator`가 DB clock 기반 entitlement/lease를 확보한 뒤 실행하고 commit 직전에 같은 entitlement를 재검증한다. evidence와 typed observation이 canonical source fact이며, immutable recommendation/validation run과 atomic review state가 화면별 read model을 공급한다. `SourcingWorkspaceSnapshot`과 browser storage는 재생성 가능한 projection/cache로만 사용한다. 기존 sourcing-owned 데이터는 승인 hash가 있는 pre-schema reset으로 제거하되 downstream이 참조하는 candidate/image provenance는 기존 status를 보존한 채 soft-delete한다.

**Tech Stack:** NestJS 11, Prisma 7, PostgreSQL 17, Zod 3, class-validator, Next.js/React 19, TanStack Query, Chrome Manifest V3, Vitest, Supertest, Node test, Testcontainers

## Global Constraints

- Delivery는 `develop` 대상 단일 PR이다. 아래 7개 Task는 같은 PR 안의 reviewer-sized 독립 커밋이고, collection/schema/read-model/cutover의 4개 논리 phase로 묶는다. 일부만 Office에 배포하지 않는다.
- 변경 분류는 sourcing-domain reconstruction이다. Operations의 run/idempotency 경계, Supply의 sourcing-offer repository race, AgentOS의 sourcing keyword ingress validation만 cross-domain 예외로 허용한다. Ads 내부 모델, Product/Channel/Order 데이터, Python sourcing runtime 정리는 범위 밖이다.
- 사이드바 14개 route, 탭 구조, 주요 CTA 위치는 유지한다. enabled 상태의 control은 실제 command에 연결하고, 실행할 수 없으면 같은 위치에서 이유를 표시한 disabled 상태로 둔다.
- 기존 sourcing 데이터는 backfill하지 않는다. `ProductPreparation`, `MasterProduct`, `ChannelListing`, 주문·재고·정산·광고 데이터와 이들이 참조하는 candidate/image provenance는 삭제하지 않는다.
- 이 PR은 `SourcingDecisionBatch`, `ProcurementTestIntent`, `PurchaseOrder`, provider submission을 새로 만들지 않는다. Final CTA의 terminal side effect는 `SourcingReviewBatch` 생성뿐이다.
- 모든 mutating service와 single-resource read는 `organizationId`를 `@CurrentOrganization()`에서 받고 client body의 조직 값은 받지 않는다. 새 sourcing route는 `sourcing/workspace/*`, `sourcing/collection/*`, `sourcing/control/*`처럼 두 segment 이상을 사용한다.
- application/domain code는 Prisma나 concrete adapter를 import하지 않는다. DB clock, partial unique constraint, `FOR UPDATE`, raw SQL은 repository adapter가 소유한다.
- `String`과 DTO/Zod/domain validation을 사용하며 native PostgreSQL enum은 추가하지 않는다. 새 ID는 UUID, timestamp는 `@db.Timestamptz`, 금액은 `Decimal(12, 2)`를 사용한다.
- 500줄 이상 파일 변경은 reconstruction으로 명시하고 orchestration/storage를 새 service/hook으로 이동한다. 700줄 이상 파일에는 새 substantial behavior를 추가하지 않는다.
- 배포된 Extension v1 snake_case payload는 계속 수용한다. v1은 commit-time entitlement를 필수로 하고, v2는 browser read 전에 server-issued session까지 요구한다.
- schema 적용 전 pre-schema reset plan hash를 확인한다. 운영 dual-read, dual-write, old snapshot fallback은 두지 않는다.
- 구현 중 scope가 다른 디렉터리로 이동할 때 해당 `AGENTS.md` chain을 다시 읽는다.

---

**Companion Specification:** [`docs/superpowers/specs/2026-08-08-sourcing-backend-data-stabilization-design.md`](../specs/2026-08-08-sourcing-backend-data-stabilization-design.md)

## Official Implementation References

- Prisma의 partial `@@unique(..., where: raw(...))`는 `partialIndexes` preview feature가 필요하며 이 저장소의 `prisma/schema.prisma`에 이미 활성화되어 있다: [Prisma indexes documentation](https://www.prisma.io/docs/orm/prisma-schema/data-model/indexes).
- Prisma upsert는 query shape에 따라 DB-native upsert가 아닐 수 있고 concurrent create가 `P2002`를 낼 수 있으므로 nested graph create는 transaction 밖에서 conflict recovery한다: [Prisma Client reference](https://docs.prisma.io/docs/orm/reference/prisma-client-reference).
- PostgreSQL transaction은 statement error 뒤 aborted 상태가 되어 rollback 전 후속 query를 거절하므로 같은 interactive transaction에서 winner를 다시 읽지 않는다: [PostgreSQL transaction documentation](https://www.postgresql.org/docs/current/tutorial-transactions.html).
- Assistant HTTP budget은 project의 global throttler 위에 handler별 `@Throttle()` override로 적용한다: [NestJS rate-limiting documentation](https://docs.nestjs.com/security/rate-limiting).

## Canonical Contracts

### Read envelope

모든 새 screen read model은 같은 상태 envelope를 사용한다.

```typescript
type SourcingReadStatus = 'ready' | 'collecting' | 'stale' | 'unavailable';

interface SourcingReadEnvelope<T> {
  status: SourcingReadStatus;
  generatedAt: string;
  lastSuccessfulAt: string | null;
  freshUntil: string | null;
  operationId: string | null;
  data: T | null;
  warnings: Array<{ code: string; message: string }>;
  error: null | { code: string; retryable: boolean; message: string };
}
```

`unavailable`과 transport/internal error의 `data`는 `null`이다. 실제 성공 결과가 0건일 때만 `ready`와 빈 list를 함께 반환한다.

### Collection run

```text
collecting -> complete | partial | failed | quarantined
collecting -> cancel_requested -> cancelled
collecting -> superseded
```

Active 상태는 `collecting | cancel_requested`뿐이다. 동일 조직·source/scope·target의 active run은 DB partial unique constraint로 하나만 존재한다. 동일 idempotency key와 다른 request hash는 `409 IDEMPOTENCY_CONFLICT`다.

### Derived and human state

```text
recommendation: running -> complete | partial | failed
validation: pending -> observing -> ready_for_review | blocked | failed
selection: neutral | selected | removed
review batch: awaiting_procurement_enablement | cancelled
```

추천/검증 terminal run은 immutable하다. selection만 versioned atomic mutation이며 review batch item은 생성 시 recommendation, validation, offer evidence를 고정한다.

## File Responsibility Map

| Area | Canonical files after cutover |
|---|---|
| Shared wire contracts | `packages/shared/src/sourcing/workspace.ts`, `packages/shared/src/sourcing/extension.ts`, `packages/shared/src/sourcing/index.ts` |
| Schema | `prisma/models/sourcing.prisma`, `prisma/models/core.prisma` |
| Collection control | `apps/server/src/sourcing/application/service/sourcing-collection-coordinator.service.ts`, `apps/server/src/sourcing/application/port/out/repository/sourcing-collection.repository.port.ts`, matching Prisma adapter |
| Source facts | existing evidence ledger plus `Sourcing1688OfferKeywordObservation` and freshness-guarded trend repositories |
| Derived state | `sourcing-recommendation.service.ts`, `sourcing-validation.service.ts`, `sourcing-review.service.ts`, matching repository ports/adapters |
| HTTP facade | `sourcing-workspace.controller.ts`, `sourcing-collection.controller.ts`, `sourcing-control.controller.ts`, Extension v1/v2 ingest controllers |
| Web state | `sourcing-workspace-api.ts`, `use-sourcing-workspace.ts`, React Query keys; page components remain presenters |
| Reset/cutover | `scripts/data-migrations/v0.1.30/005_reset_sourcing_runtime_state.ts`, migration runner plan hash, `docs/runbooks/sourcing-backend-cutover.md` |

### Task 1: Shared contracts, normalized schema, and PostgreSQL repository invariants

**Files:**

- Create: `packages/shared/src/sourcing/workspace.ts`
- Create: `packages/shared/src/sourcing/workspace.spec.ts`
- Modify: `packages/shared/src/sourcing/index.ts`
- Modify: `prisma/models/sourcing.prisma`
- Modify: `prisma/models/core.prisma`
- Modify: `apps/server/src/sourcing/application/port/out/repository/sourcing-evidence-ledger.repository.port.ts`
- Modify: `apps/server/src/sourcing/adapter/out/repository/sourcing-evidence-ledger.repository.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/out/repository/sourcing-decision-batch.repository.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/out/repository/__tests__/sourcing-evidence-ledger.repository.adapter.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/out/repository/__tests__/sourcing-decision-batch.repository.adapter.spec.ts`
- Modify: `apps/server/src/supply/adapter/out/repository/supply-sourcing-procurement.repository.adapter.ts`
- Modify: `apps/server/src/supply/adapter/out/repository/__tests__/supply-sourcing-procurement.repository.adapter.spec.ts`
- Create: `apps/server/src/sourcing/__tests__/sourcing-data-invariants.pg.integration.spec.ts`

**Interfaces:**

- Consumes: existing `SourcingEvidenceLedgerRepositoryPort`, decision-batch repository commands, Supply sourcing offer/intent commands, and current `SourcingCandidate`/evidence Prisma models.
- Produces: `SourcingReadEnvelopeSchema`, `SourcingRecommendationEnvelopeSchema`, `SourcingReviewSelectionCommandSchema`, the normalized Prisma models listed in Step 3, and PostgreSQL-safe idempotency/evidence conflict behavior used by Tasks 2–7.

- [ ] **Step 1: shared read/recommendation/review contract의 실패 테스트를 작성한다.**

```typescript
import { describe, expect, it } from 'vitest';
import {
  SourcingReadEnvelopeSchema,
  SourcingRecommendationItemSchema,
  SourcingReviewSelectionCommandSchema,
} from './workspace';

describe('sourcing workspace contracts', () => {
  it('keeps unavailable distinct from a successful empty result', () => {
    expect(() => SourcingReadEnvelopeSchema.parse({
      status: 'unavailable',
      generatedAt: '2026-08-08T00:00:00.000Z',
      lastSuccessfulAt: null,
      freshUntil: null,
      operationId: null,
      data: [],
      warnings: [],
      error: { code: 'SOURCE_DISABLED', retryable: false, message: 'disabled' },
    })).toThrow();

    expect(SourcingReadEnvelopeSchema.parse({
      status: 'ready',
      generatedAt: '2026-08-08T00:00:00.000Z',
      lastSuccessfulAt: '2026-08-08T00:00:00.000Z',
      freshUntil: '2026-08-08T01:00:00.000Z',
      operationId: null,
      data: [],
      warnings: [],
      error: null,
    }).status).toBe('ready');
  });

  it('requires stable offer identity and optimistic selection version', () => {
    expect(() => SourcingRecommendationItemSchema.parse({
      itemKey: 'array-index-0',
      sourcePlatform: '1688',
      externalOfferId: '',
      variantKey: '',
      rank: 1,
      score: 90,
      grade: 'A',
      baselineAction: 'order',
      reasonCodes: [],
      riskCodes: [],
    })).toThrow();

    expect(() => SourcingReviewSelectionCommandSchema.parse({
      workspaceKey: 'entry',
      recommendationRunId: '11111111-1111-4111-8111-111111111111',
      itemKey: 'offer-key',
      state: 'selected',
    })).toThrow();
  });
});
```

Run: `rtk npm exec --workspace=packages/shared vitest -- run src/sourcing/workspace.spec.ts`

Expected: FAIL because the schemas do not exist.

- [ ] **Step 2: focused shared schemas를 구현하고 root barrel은 확장하지 않는다.**

```typescript
import { z } from 'zod';

const InstantSchema = z.string().datetime({ offset: true });
const WarningSchema = z.object({
  code: z.string().min(1).max(100),
  message: z.string().min(1).max(500),
}).strict();
const ErrorSchema = z.object({
  code: z.string().min(1).max(100),
  retryable: z.boolean(),
  message: z.string().min(1).max(500),
}).strict();

const SourcingReadEnvelopeBaseSchema = z.object({
  status: z.enum(['ready', 'collecting', 'stale', 'unavailable']),
  generatedAt: InstantSchema,
  lastSuccessfulAt: InstantSchema.nullable(),
  freshUntil: InstantSchema.nullable(),
  operationId: z.string().uuid().nullable(),
  warnings: z.array(WarningSchema).max(100),
  error: ErrorSchema.nullable(),
}).strict();

export function sourcingReadEnvelopeSchema<TSchema extends z.ZodTypeAny>(
  dataSchema: TSchema,
) {
  return SourcingReadEnvelopeBaseSchema.extend({
    data: dataSchema.nullable(),
  }).superRefine((value, context) => {
    if (value.status === 'unavailable' && value.data !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['data'], message: 'unavailable data must be null' });
    }
    if (value.status === 'ready' && value.data === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['data'], message: 'ready data is required' });
    }
    if (value.status === 'ready' && value.error !== null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['error'], message: 'ready response cannot contain an error' });
    }
  });
}

export const SourcingReadEnvelopeSchema = sourcingReadEnvelopeSchema(z.unknown());

export const SourcingRecommendationItemSchema = z.object({
  itemKey: z.string().regex(/^[a-f0-9]{64}$/),
  sourcePlatform: z.string().min(1).max(60),
  externalOfferId: z.string().min(1).max(200),
  variantKey: z.string().max(300),
  rank: z.number().int().positive(),
  score: z.number().int().min(0).max(100),
  grade: z.enum(['A', 'B', 'C', 'WATCH']),
  baselineAction: z.enum(['order', 'observe_3d', 'exclude']),
  reasonCodes: z.array(z.string().min(1).max(100)).max(50),
  riskCodes: z.array(z.string().min(1).max(100)).max(50),
}).strict();

export const SourcingReviewSelectionCommandSchema = z.object({
  workspaceKey: z.enum(['entry', 'final']),
  recommendationRunId: z.string().uuid(),
  itemKey: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(['neutral', 'selected', 'removed']),
  expectedVersion: z.number().int().nonnegative(),
}).strict();

export const SourcingReviewSelectionSchema = z.object({
  workspaceKey: z.enum(['entry', 'final']),
  recommendationRunId: z.string().uuid(),
  itemKey: z.string().regex(/^[a-f0-9]{64}$/),
  state: z.enum(['neutral', 'selected', 'removed']),
  version: z.number().int().positive(),
  updatedAt: InstantSchema,
}).strict();

export const SourcingReviewBatchCommandSchema = z.object({
  recommendationRunId: z.string().uuid(),
  itemKeys: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(100),
  idempotencyKey: z.string().uuid(),
}).strict();

export const SourcingReviewBatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['awaiting_procurement_enablement', 'cancelled']),
  itemCount: z.number().int().nonnegative(),
  createdAt: InstantSchema,
}).strict();

export const SourcingRecommendationEnvelopeSchema = sourcingReadEnvelopeSchema(
  z.object({
    runId: z.string().uuid(),
    items: z.array(SourcingRecommendationItemSchema).max(100),
    nextCursor: z.string().max(1_000).nullable(),
  }).strict(),
);

export type SourcingReadEnvelope = z.infer<typeof SourcingReadEnvelopeSchema>;
export type SourcingRecommendationItem = z.infer<typeof SourcingRecommendationItemSchema>;
export type SourcingRecommendationEnvelope = z.infer<typeof SourcingRecommendationEnvelopeSchema>;
export type SourcingReviewSelection = z.infer<typeof SourcingReviewSelectionSchema>;
export type SourcingReviewSelectionCommand = z.infer<typeof SourcingReviewSelectionCommandSchema>;
export type SourcingReviewBatchCommand = z.infer<typeof SourcingReviewBatchCommandSchema>;
export type SourcingReviewBatch = z.infer<typeof SourcingReviewBatchSchema>;
```

`packages/shared/src/sourcing/index.ts`에서 `export * from './workspace';`만 추가한다.

- [ ] **Step 3: Prisma schema에 새 durable state를 additive하게 추가하고 collection/evidence invariant를 강화한다.**

이번 단계에서는 legacy `TrendSeedKeyword`, `Sourcing1688HotProductDailySnapshot`, workspace payload 필드를 아직 제거하지 않는다. 새 코드 cutover와 pre-schema reset이 준비된 Task 7에서 legacy 모델을 제거한다.

추가할 model은 다음과 같다.

```text
SourcingInterestTarget
Sourcing1688OfferKeywordObservation
SourcingRecommendationRun
SourcingRecommendationItem
SourcingRecommendationItemEvidence
SourcingValidationEpisode
SourcingValidationCheck
SourcingValidationCheckEvidence
SourcingReviewSelection
SourcingReviewBatch
SourcingReviewBatchItem
```

각 model의 `@@map`은 순서대로 `sourcing_interest_targets`, `sourcing_1688_offer_keyword_observations`, `sourcing_recommendation_runs`, `sourcing_recommendation_items`, `sourcing_recommendation_item_evidence`, `sourcing_validation_episodes`, `sourcing_validation_checks`, `sourcing_validation_check_evidence`, `sourcing_review_selections`, `sourcing_review_batches`, `sourcing_review_batch_items`로 고정한다.

필수 unique/index/FK는 다음 exact contract로 고정한다.

```prisma
@@unique([organizationId, normalizedKeyword], map: "sourcing_interest_targets_org_keyword_key")
@@index([organizationId, enabled, updatedAt], map: "sourcing_interest_targets_enabled_updated_idx")

@@unique([evidenceObservationId, organizationId], map: "sourcing_1688_offer_keyword_observations_evidence_org_key")
@@unique([organizationId, businessDate, sourceKeywordNormalized, externalOfferId, variantKeyNormalized, capturedAt], map: "sourcing_1688_offer_keyword_observations_identity_key")
@@index([organizationId, sourceKeywordNormalized, capturedAt(sort: Desc)], map: "sourcing_1688_offer_keyword_observations_keyword_captured_idx")
@@index([organizationId, externalOfferId, variantKeyNormalized, capturedAt(sort: Desc)], map: "sourcing_1688_offer_keyword_observations_offer_captured_idx")

@@unique([organizationId, policyKey, policyVersion, modelVersion, calculationVersion, inputManifestHash], map: "sourcing_recommendation_runs_manifest_key")
@@index([organizationId, status, completedAt(sort: Desc), id], map: "sourcing_recommendation_runs_latest_idx")
@@unique([recommendationRunId, itemKey], map: "sourcing_recommendation_items_run_item_key")
@@index([organizationId, externalOfferId, variantKeyNormalized], map: "sourcing_recommendation_items_offer_variant_idx")

@@unique([organizationId, workspaceKey, itemKey], map: "sourcing_review_selections_workspace_item_key")
@@index([organizationId, recommendationRunId, state], map: "sourcing_review_selections_run_state_idx")
@@unique([organizationId, idempotencyKey], map: "sourcing_review_batches_org_idempotency_key")
@@unique([reviewBatchId, recommendationItemId], map: "sourcing_review_batch_items_batch_item_key")
```

새 model의 모든 relation은 `[id, organizationId]` composite reference를 사용한다. `SourcingRecommendationItemEvidence`와 `SourcingValidationCheckEvidence`가 evidence observation FK를 소유해 retention 보호를 가능하게 한다. `SourcingReviewBatchItem`은 recommendation item, nullable validation episode, exact offer observation ID를 고정한다.

기존 run/observation에는 다음 field/constraint를 추가한다.

```prisma
// SourcingCandidate
externalOfferId      String? @map("external_offer_id") @db.VarChar(200)
variantKeyNormalized String  @default("") @map("variant_key_normalized") @db.VarChar(300)
sourceIdentityHash   String? @map("source_identity_hash") @db.VarChar(64)

@@unique([organizationId, sourcePlatform, sourceIdentityHash], map: "sourcing_candidates_org_platform_identity_key", where: raw("source_identity_hash IS NOT NULL AND is_deleted = false AND status = 'sourced'"))

// SourcingEvidenceIngestionRun
sourceKey              String    @map("source_key") @db.VarChar(80)
scopeKey               String    @map("scope_key") @db.VarChar(160)
leaseToken             String    @map("lease_token") @db.Uuid
leaseExpiresAt         DateTime  @map("lease_expires_at") @db.Timestamptz
authorizationCheckedAt DateTime  @map("authorization_checked_at") @db.Timestamptz
entitlementVersionHash String    @map("entitlement_version_hash") @db.VarChar(64)
generation             Int       @default(1)
cancelRequestedAt      DateTime? @map("cancel_requested_at") @db.Timestamptz
staleDiscardedCount    Int       @default(0) @map("stale_discarded_count")

@@unique([organizationId, sourceKey, scopeKey, targetKey], map: "sourcing_evidence_ingestion_runs_active_target_key", where: raw("status IN ('collecting', 'cancel_requested')"))

// SourcingEvidenceObservation
envelopeHash String @map("envelope_hash") @db.VarChar(64)
```

`SourcingWorkspaceSnapshot`에는 `projectionVersion`, `inputHash`, `generatedAt`, `expiresAt`을 추가하고 unique identity를 `(organizationId, scope, businessDate, projectionVersion, inputHash)`로 바꾼다. client writer는 Task 5에서 제거한다.

- [ ] **Step 4: 실제 PostgreSQL에서 동시성·retry invariant가 실패하는 테스트를 작성한다.**

`sourcing-data-invariants.pg.integration.spec.ts`에 다음 case를 넣는다.

```typescript
it('creates one active collection run for twenty concurrent claims', async () => {
  const claims = await Promise.all(Array.from({ length: 20 }, () =>
    collectionRepository.claimAuthorizedRun(activeClaim),
  ));
  expect(claims.filter((claim) => claim.kind === 'claimed')).toHaveLength(1);
  expect(await prisma.sourcingEvidenceIngestionRun.count({
    where: { organizationId: TEST_ORGANIZATION_ID, status: 'collecting' },
  })).toBe(1);
});

it('rejects a retry whose immutable evidence envelope changed', async () => {
  await evidenceRepository.appendObservations([observation]);
  const conflict = await evidenceRepository.appendObservations([{
    ...observation,
    sourceUrl: 'https://detail.1688.com/offer/changed.html',
  }]);
  expect(conflict).toEqual({
    kind: 'observation_conflict',
    observationKey: observation.observationKey,
    revision: observation.revision,
  });
});

it('recovers an idempotency winner outside an aborted transaction', async () => {
  const [left, right] = await Promise.all([
    decisionRepository.create(command),
    decisionRepository.create(command),
  ]);
  expect(left.id).toBe(right.id);
  expect(await prisma.sourcingDecisionBatch.count({
    where: { organizationId: TEST_ORGANIZATION_ID, idempotencyKey: command.idempotencyKey },
  })).toBe(1);
});
```

Run: `rtk npm run test:integration --workspace=apps/server -- src/sourcing/__tests__/sourcing-data-invariants.pg.integration.spec.ts`

Expected: FAIL on the active-run constraint/envelope hash and current same-transaction `P2002` recovery.

- [ ] **Step 5: repository conflict handling을 PostgreSQL-safe하게 바꾼다.**

- evidence batch insert는 `INSERT ... ON CONFLICT DO NOTHING RETURNING`을 사용한다. 반환되지 않은 key/revision row를 같은 non-aborted transaction에서 읽고 `envelopeHash`를 비교한다.
- `envelopeHash`는 source/platform/family/role/decision impact, source entity identity, observation/schema type, concept/support/source URL, event/observed/available/revision timestamps, revision/supersedes, payload hash의 canonical JSON SHA-256이다.
- decision batch와 Supply offer/intent의 `P2002` catch를 interactive transaction callback 밖으로 이동한다. transaction이 reject된 뒤 root Prisma client로 winner를 읽고 request hash를 비교한다.
- decision/offer/intent adapters는 advisory lock을 얻은 뒤 `SELECT CURRENT_TIMESTAMP`를 읽는다. offer `validUntil`, entitlement expiry, decision expiry를 service precheck뿐 아니라 write transaction의 그 DB timestamp로 다시 확인한다.
- mock tests는 `$transaction` 자체가 `P2002`로 reject되고 이후 root client read가 호출되는 형태로 변경한다.

각 adapter의 create/recover control flow는 다음 순서를 그대로 사용한다. 현재 transaction callback 본문은 `createAttempt(tx, command)` private method로 추출하고 기존 `decisionBatchInclude`/`duplicateResult` mapper를 재사용한다.

```typescript
try {
  return await this.prisma.$transaction((tx) => this.createAttempt(tx, command));
} catch (error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    throw error;
  }
}

const winner = await this.prisma.sourcingDecisionBatch.findUnique({
  where: {
    organizationId_idempotencyKey: {
      organizationId: command.organizationId,
      idempotencyKey: command.batchKey,
    },
  },
  include: decisionBatchInclude,
});
if (!winner) throw new ConflictException('idempotency winner was not visible');
return duplicateResult(winner, command.requestHash);
```

- [ ] **Step 6: focused gates를 통과시키고 첫 커밋을 만든다.**

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/sourcing/workspace.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/sourcing/adapter/out/repository src/sourcing/domain/source-entitlement-policy.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/supply/adapter/out/repository/__tests__/supply-sourcing-procurement.repository.adapter.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/sourcing/__tests__/sourcing-data-invariants.pg.integration.spec.ts
rtk npx prisma validate
rtk npx prisma generate
rtk npm run build --workspace=packages/shared
```

Expected: all tests PASS, Prisma validate/generate and shared build exit 0.

```bash
rtk git add packages/shared/src/sourcing prisma/models apps/server/src/sourcing apps/server/src/supply
rtk git commit -m "refactor: add normalized sourcing data contracts"
```

### Task 2: Strict collection coordinator, freshness fencing, cancellation, and idempotency

**Files:**

- Create: `apps/server/src/sourcing/domain/sourcing-collection-run.ts`
- Create: `apps/server/src/sourcing/domain/sourcing-collection-run.spec.ts`
- Create: `apps/server/src/sourcing/application/port/out/repository/sourcing-collection.repository.port.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-collection-coordinator.service.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-collection-coordinator.service.spec.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-collection-mappers.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-collection-mappers.spec.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/sourcing-collection.repository.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/__tests__/sourcing-collection.repository.adapter.spec.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-source-registry.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-evidence-ledger.service.ts`
- Modify: `apps/server/src/sourcing/application/service/trend-collect.service.ts`
- Delete after replacement tests pass: `apps/server/src/sourcing/application/service/trend-evidence-ingestion.service.ts`
- Delete after replacement tests pass: `apps/server/src/sourcing/application/service/__tests__/trend-evidence-ingestion.service.spec.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-1688-keyword-search.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-1688-image-search.service.ts`
- Modify: `apps/server/src/sourcing/adapter/out/repository/trend-collection.repository.adapter.ts`
- Modify: `apps/server/src/sourcing/adapter/in/operation/sourcing-trend.operation-handler.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/trend-collection.controller.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Modify: `apps/server/src/sourcing/application/service/__tests__/sourcing-source-registry.service.spec.ts`
- Modify: `apps/server/src/sourcing/application/service/__tests__/sourcing-evidence-ledger.service.spec.ts`
- Modify: `apps/server/src/sourcing/application/service/__tests__/trend-collect.service.spec.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-1688-keyword-search.service.spec.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-1688-image-search.service.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/in/operation/__tests__/sourcing-trend.operation-handler.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/__tests__/trend-collection.controller.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/__tests__/sourcing-1688-trend-extension.controller.spec.ts`

**Interfaces:**

- Consumes: Task 1's `SourcingEvidenceIngestionRun` lease/authorization fields, `Sourcing1688OfferKeywordObservation`, evidence append command, and freshness-safe typed repositories.
- Produces: `SourcingCollectionRepositoryPort`, `SourcingCollectionPermit`, `AuthorizedCollectionOutput`, and `SourcingCollectionCoordinator.execute(input, collector)` as the only allowed external-collection write path for Tasks 3, 4, and 7.

- [ ] **Step 1: provider call 전에 권한을 막고 commit 전에 재검사하는 실패 테스트를 작성한다.**

```typescript
it.each(['missing', 'expired', 'killed'] as const)(
  'does not call a provider or commit when entitlement is %s',
  async (state) => {
    collectionRepository.claimAuthorizedRun.mockResolvedValue({
      kind: 'denied',
      reasonCode: `source_entitlement_${state}`,
    });

    await expect(coordinator.execute(request, provider)).rejects.toMatchObject({
      response: { code: `source_entitlement_${state}` },
    });
    expect(provider).not.toHaveBeenCalled();
    expect(collectionRepository.commit).not.toHaveBeenCalled();
  },
);

it('discards results when entitlement changes during provider IO', async () => {
  collectionRepository.claimAuthorizedRun.mockResolvedValue({ kind: 'claimed', permit });
  collectionRepository.commit.mockResolvedValue({ kind: 'authorization_changed' });

  await expect(coordinator.execute(request, provider)).rejects.toMatchObject({
    response: { code: 'SOURCE_AUTHORIZATION_CHANGED' },
  });
  expect(provider).toHaveBeenCalledTimes(1);
  expect(collectionRepository.commit).toHaveBeenCalledTimes(1);
  expect(collectionRepository.fail).not.toHaveBeenCalled();
});
```

Run: `rtk npm exec --workspace=apps/server vitest -- run src/sourcing/application/service/__tests__/sourcing-collection-coordinator.service.spec.ts`

Expected: FAIL because the coordinator does not exist and current collectors call providers before evidence authorization.

- [ ] **Step 2: framework-free state policy와 outgoing unit-of-work contract를 추가한다.**

```typescript
export type ActiveCollectionStatus = 'collecting' | 'cancel_requested';
export type TerminalCollectionStatus =
  | 'complete'
  | 'partial'
  | 'failed'
  | 'quarantined'
  | 'cancelled'
  | 'superseded';

export interface SourcingCollectionPermit {
  runId: string;
  organizationId: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  leaseToken: string;
  generation: number;
  entitlementVersionId: string;
  entitlementVersionHash: string;
  leaseExpiresAt: Date;
}

export type ClaimAuthorizedRunResult =
  | { kind: 'claimed'; permit: SourcingCollectionPermit }
  | { kind: 'existing'; permit: SourcingCollectionPermit }
  | { kind: 'denied'; reasonCode: string }
  | { kind: 'idempotency_conflict' };

export interface ClaimAuthorizedRunInput {
  organizationId: string;
  sourceKey: string;
  scopeKey: string;
  targetKey: string;
  idempotencyKey: string;
  requestHash: string;
  collectorKey: string;
  collectorVersion: string;
  triggerKind: 'manual' | 'schedule' | 'extension' | 'bootstrap' | 'retry';
  triggeredByUserId: string | null;
  leaseDurationMs: number;
}

export interface Sourcing1688OfferKeywordObservationWrite {
  organizationId: string;
  evidenceObservationId: string;
  ingestionRunId: string;
  businessDate: Date;
  sourceKeywordNormalized: string;
  externalOfferId: string;
  variantKeyNormalized: string;
  rank: number | null;
  title: string | null;
  priceMinCny: number | null;
  priceMaxCny: number | null;
  minOrderQuantity: number | null;
  monthlySales: number | null;
  repurchaseRate: string | null;
  supplierExternalId: string | null;
  supplierName: string | null;
  imageUrl: string | null;
  sourceUrl: string;
  capturedAt: Date;
  schemaVersion: string;
}

export type SourcingTypedCollectionRecord =
  | { kind: 'naver_keyword'; row: NaverKeywordSnapshotUpsert }
  | { kind: 'naver_popular_keyword'; row: NaverPopularKeywordSnapshotUpsert }
  | { kind: 'offer_1688_keyword'; row: Sourcing1688OfferKeywordObservationWrite }
  | { kind: 'shorts'; row: ShortsSnapshotUpsert }
  | { kind: 'tiktok_creative'; row: TiktokCcSnapshotUpsert }
  | { kind: 'live_commerce_broadcast'; row: LiveCommerceBroadcastSnapshotUpsert }
  | { kind: 'live_commerce_product'; row: LiveCommerceProductSnapshotUpsert };

export interface AuthorizedCollectionOutput {
  observations: AppendSourcingEvidenceObservationCommand[];
  typedRecords: SourcingTypedCollectionRecord[];
  discoveredCount: number;
  rejectedCount: number;
  qualityReport: Record<string, unknown>;
}

export interface CommitAuthorizedCollectionInput {
  permit: SourcingCollectionPermit;
  output: AuthorizedCollectionOutput;
}

export type CommitAuthorizedCollectionResult =
  | { kind: 'committed'; runId: string; acceptedCount: number; duplicateCount: number; staleDiscardedCount: number }
  | { kind: 'authorization_changed' }
  | { kind: 'lease_lost' }
  | { kind: 'cancelled' }
  | { kind: 'superseded' };

export interface FailAuthorizedCollectionInput {
  permit: SourcingCollectionPermit;
  error: { code: string; message: string; retryable: boolean };
}

export interface SourcingCollectionRepositoryPort {
  claimAuthorizedRun(input: ClaimAuthorizedRunInput): Promise<ClaimAuthorizedRunResult>;
  checkpoint(permit: SourcingCollectionPermit): Promise<'continue' | 'cancel' | 'superseded'>;
  commit(input: CommitAuthorizedCollectionInput): Promise<CommitAuthorizedCollectionResult>;
  fail(input: FailAuthorizedCollectionInput): Promise<void>;
  requestCancel(input: { organizationId: string; runId: string; requestedByUserId: string }): Promise<void>;
}
```

위 snapshot row types와 `AppendSourcingEvidenceObservationCommand`는 기존/new repository port에서 import한다. Commit input은 callback이나 Prisma type을 받지 않는다.

- [ ] **Step 3: coordinator를 구현하고 DB clock 기반 claim/commit transaction을 adapter에 둔다.**

```typescript
import { ConflictException, ForbiddenException, GoneException, Inject, Injectable } from '@nestjs/common';

export type ExecuteSourcingCollectionInput = ClaimAuthorizedRunInput;
export type SourcingAuthorizedCollector = (context: {
  permit: SourcingCollectionPermit;
  checkpoint: () => Promise<void>;
}) => Promise<AuthorizedCollectionOutput>;
export type SourcingCollectionExecutionResult =
  | { kind: 'existing'; runId: string }
  | { kind: 'committed'; runId: string; acceptedCount: number; duplicateCount: number; staleDiscardedCount: number };

function sourceDenied(reasonCode: string): ForbiddenException {
  return new ForbiddenException({ code: reasonCode });
}

function idempotencyConflict(): ConflictException {
  return new ConflictException({ code: 'IDEMPOTENCY_CONFLICT' });
}

function collectionStopped(state: 'cancel' | 'superseded'): GoneException {
  return new GoneException({ code: state === 'cancel' ? 'COLLECTION_CANCELLED' : 'COLLECTION_SUPERSEDED' });
}

function normalizeCollectionError(error: unknown): { code: string; message: string; retryable: boolean } {
  if (error instanceof GoneException) {
    const response = error.getResponse();
    const code = typeof response === 'object' && response !== null && 'code' in response
      ? String(response.code)
      : 'COLLECTION_STOPPED';
    return { code, message: error.message, retryable: false };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: 'COLLECTION_FAILED', message, retryable: false };
}

function mapCommit(result: CommitAuthorizedCollectionResult): SourcingCollectionExecutionResult {
  if (result.kind === 'committed') return result;
  if (result.kind === 'authorization_changed') {
    throw new ForbiddenException({ code: 'SOURCE_AUTHORIZATION_CHANGED' });
  }
  if (result.kind === 'cancelled') throw collectionStopped('cancel');
  if (result.kind === 'superseded' || result.kind === 'lease_lost') {
    throw collectionStopped('superseded');
  }
  throw new TypeError('Unhandled collection commit result');
}

@Injectable()
export class SourcingCollectionCoordinator {
  constructor(
    @Inject(SOURCING_COLLECTION_REPOSITORY_PORT)
    private readonly repository: SourcingCollectionRepositoryPort,
  ) {}

  async execute(
    input: ExecuteSourcingCollectionInput,
    collector: SourcingAuthorizedCollector,
  ): Promise<SourcingCollectionExecutionResult> {
    const claim = await this.repository.claimAuthorizedRun(input);
    if (claim.kind === 'denied') throw sourceDenied(claim.reasonCode);
    if (claim.kind === 'idempotency_conflict') throw idempotencyConflict();
    if (claim.kind === 'existing') return { kind: 'existing', runId: claim.permit.runId };

    const checkpoint = async (): Promise<void> => {
      const state = await this.repository.checkpoint(claim.permit);
      if (state !== 'continue') throw collectionStopped(state);
    };

    let output: AuthorizedCollectionOutput;
    try {
      await checkpoint();
      output = await collector({ permit: claim.permit, checkpoint });
      await checkpoint();
    } catch (error: unknown) {
      await this.repository.fail({ permit: claim.permit, error: normalizeCollectionError(error) });
      throw error;
    }
    return mapCommit(await this.repository.commit({ permit: claim.permit, output }));
  }
}
```

Adapter claim transaction은 `CURRENT_TIMESTAMP`, current entitlement row, policy evaluation, active partial unique constraint를 한 transaction에서 처리한다. Commit transaction은 같은 DB clock으로 entitlement version/hash/expiry/kill switch, lease token/generation, cancellation을 재검사한 뒤 evidence와 typed rows를 batch write한다. 재검사 실패 시 typed/evidence row를 0건으로 유지하고 run을 `superseded` 또는 `quarantined`로 끝낸다. `fail()`은 `COLLECTION_CANCELLED`와 `COLLECTION_SUPERSEDED`를 각각 terminal `cancelled`/`superseded`로, 그 밖의 오류를 `failed`로 매핑한다.

`SourcingSourceRegistryService.authorize`의 optional `at`과 domain policy의 implicit `new Date()` fallback을 제거한다. HTTP/admin read validation도 repository가 반환한 DB timestamp를 명시적으로 전달하며, collection claim/commit은 adapter transaction 안에서만 권한을 판정한다.

- [ ] **Step 4: 모든 live collection ingress를 coordinator로 옮긴다.**

- `TrendCollectService`는 source별 canonical observation을 만드는 orchestration만 남기고 provider 호출 전 `coordinator.execute`를 사용한다. 745줄 파일의 evidence/build/write helper는 새 coordinator/mapper 파일로 이동한다.
- Naver SearchAd/DataLab/autocomplete/popular, Shorts/Shortstrend, TikTok, Taobao live-commerce, Google Trends RSS, Linkfox/Echotik shadow, 1688 keyword/image search와 extension trend ingest가 typed repository를 직접 호출하지 않게 한다.
- source key/scope/target normalization을 하나로 고정한다. 예: `naver.datalab_keyword/default/실리콘-식판`, `1688.hot_product/default/儿童餐盘`.
- `incoming.capturedAt > stored.capturedAt`일 때만 typed current row를 갱신하고 같거나 오래된 row는 `staleDiscardedCount`에 기록한다.
- 1688 identity는 trusted `offerId` 또는 allowlisted URL의 offer ID와 normalized variant key를 사용한다. URL tracking query, title, array index는 key에 포함하지 않는다.
- provider batch 사이와 Operations cancellation callback에서 `checkpoint()`를 호출한다. cancel/supersede 뒤 성공 toast용 complete result를 반환하지 않는다.
- Market shadow daily claim도 같은 lease/generation을 사용한다. DB lease expiry 이후에만 reclaim하고 generation을 증가시켜 이전 collector commit을 fence한다.
- `TrendEvidenceIngestionService`의 post-write best-effort 경로는 삭제한다.

각 ingress는 provider-specific mapper만 callback 안에 두고 같은 호출 형태를 사용한다. `normalizeCollectionTarget`, `hashCollectionRequest`, `map1688HotProductsToAuthorizedOutput`은 새 `sourcing-collection-mappers.ts`가 export하고 이 Task의 mapper unit spec에서 canonical whitespace, stable hash, typed/evidence output을 고정한다.

```typescript
return this.collectionCoordinator.execute({
  organizationId,
  sourceKey: '1688.hot_product',
  scopeKey: 'default',
  targetKey: normalizeCollectionTarget(keyword),
  idempotencyKey,
  requestHash: hashCollectionRequest({ keyword, limit }),
  collectorKey: 'trend-1688-hot-product',
  collectorVersion: TREND_1688_COLLECTOR_VERSION,
  triggerKind,
  triggeredByUserId,
  leaseDurationMs: 120_000,
}, async ({ checkpoint }) => {
  await checkpoint();
  const products = await this.hotProductProvider.collect({ keyword, limit });
  await checkpoint();
  return map1688HotProductsToAuthorizedOutput({ organizationId, keyword, products });
});
```

- [ ] **Step 5: operation idempotency와 restart recovery test를 추가한다.**

`SourcingTrendOperationHandler`는 child source target마다 `operationRun.id + source + normalized target`을 request key로 전달한다. 같은 operation 재-dispatch는 existing collection run을 관찰하고 provider를 다시 호출하지 않는다. controller 직접 collect path도 `Idempotency-Key`를 parse해 Operations에 전달한다.

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/sourcing/domain/sourcing-collection-run.spec.ts src/sourcing/application/service/__tests__/sourcing-collection-coordinator.service.spec.ts src/sourcing/application/service/__tests__/trend-collect.service.spec.ts src/sourcing/adapter/in/operation/__tests__/sourcing-trend.operation-handler.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/sourcing/__tests__/sourcing-data-invariants.pg.integration.spec.ts
```

Expected: permission provider spy 0회, concurrent active run 1개, stale write discard, cancel/supersede terminal state가 모두 PASS.

- [ ] **Step 6: module wiring과 architecture gate를 검증하고 커밋한다.**

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/sourcing/__tests__/sourcing.architecture.spec.ts src/sourcing/__tests__/sourcing.module.wiring.spec.ts src/sourcing
rtk npm run build --workspace=apps/server
```

Expected: sourcing unit suite와 server build PASS.

```bash
rtk git add apps/server/src/sourcing
rtk git commit -m "refactor: gate sourcing collection through authorized runs"
```

### Task 3: Extension v1/v2 ingestion, URL hardening, and retrieval-only assistant

**Files:**

- Create: `packages/shared/src/sourcing/extension.ts`
- Create: `packages/shared/src/sourcing/extension.spec.ts`
- Modify: `packages/shared/src/sourcing/index.ts`
- Create: `extensions/tests/fixtures/1688-product-detail-v1.json`
- Create: `apps/server/src/sourcing/adapter/in/http/dto/receive-extension-v2-data.dto.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/dto/receive-extension-data.dto.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/dto/index.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-extension-ingest.service.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-extension-ingest.service.spec.ts`
- Create: `apps/server/src/sourcing/domain/supplier-source-url-policy.ts`
- Create: `apps/server/src/sourcing/domain/supplier-source-url-policy.spec.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-extension-ingest.controller.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/__tests__/sourcing-extension-ingest.http.pg.integration.spec.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing.service.ts`
- Modify: `apps/server/src/sourcing/adapter/out/runtime/sourcing-playwright-runtime.handler.ts`
- Modify: `apps/server/src/sourcing/adapter/out/runtime/__tests__/sourcing-playwright-runtime.handler.spec.ts`
- Create: `extensions/kiditem-os/background/sourcing/url-policy.js`
- Modify: `extensions/kiditem-os/background/service-worker.js`
- Modify: `extensions/kiditem-os/background/sourcing/worker.js`
- Modify: `extensions/tests/helpers/domain-worker-modules.mjs`
- Modify: `extensions/tests/product-scraper/background-auth.test.mjs`
- Create: `extensions/tests/product-scraper/sourcing-url-policy.test.mjs`
- Modify: `apps/server/src/sourcing/application/service/sourcing-assistant.service.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-entry-recommendation.controller.ts`
- Delete: `apps/server/src/sourcing/application/port/out/runtime/sourcing-assistant-cli.port.ts`
- Delete: `apps/server/src/sourcing/adapter/out/runtime/claude-cli-assistant.adapter.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Modify: `apps/server/src/sourcing/AGENTS.md`
- Modify: `extensions/kiditem-os/background/sourcing/AGENTS.md`
- Modify: `docs/ARCHITECTURE.md`

**Interfaces:**

- Consumes: Task 2's `SourcingCollectionCoordinator.execute`, canonical candidate/offer identity fields, and Task 1 evidence persistence.
- Produces: `SourcingExtensionV1ProductSchema`, `SourcingExtensionV2ProductSchema`, `SourcingExtensionIngestService.ingestV1/ingestV2`, server `parseAllowedSupplierUrl`, extension `KiditemSourcingUrlPolicy.parseAllowedSupplierUrl`, and retrieval-only assistant responses consumed by Tasks 4–6.

- [ ] **Step 1: actual extractor shape와 ValidationPipe 계약의 실패 테스트를 고정한다.**

`1688-product-detail-v1.json`은 extractor가 실제로 내보내는 다음 field를 모두 가진다.

```json
{
  "page_type": "detail",
  "source_url": "https://detail.1688.com/offer/607635921546.html",
  "source_platform": "1688",
  "product_id": "607635921546",
  "title": "어린이 실리콘 식판",
  "images": ["https://cbu01.alicdn.com/img/ibank/example.jpg"],
  "price_min": 12.5,
  "price_max": 18.75,
  "currency": "CNY",
  "moq": 2,
  "unit": "개",
  "sales_volume": 240,
  "supplier_name": "샘플 공급사",
  "seller_login_id": "sample-login",
  "seller_user_id": "supplier-1",
  "specs": [{ "key": "재질", "value": "실리콘" }],
  "sku_attrs": [{ "name": "색상", "values": ["분홍", "파랑"] }],
  "sku_list": [{ "sku_id": "sku-1", "price": 12.5, "stock": 100 }],
  "price_tiers": [{ "beginAmount": 2, "price": 12.5 }]
}
```

Supertest integration은 production과 동일한 pipe를 사용한다.

```typescript
app.useGlobalPipes(new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: false,
}));

const response = await request(app.getHttpServer())
  .post('/api/sourcing/extension/product-data')
  .set(authenticatedOrganizationHeaders())
  .send(v1Fixture)
  .expect(201);

expect(response.body).toMatchObject({ ok: true, product_count: 1 });
const candidate = await prisma.sourcingCandidate.findFirstOrThrow({
  where: { organizationId: TEST_ORGANIZATION_ID, externalOfferId: '607635921546' },
});
expect(candidate.costCny?.toFixed(2)).toBe('12.50');
const offer = await prisma.supplierOfferSkuSnapshot.findFirstOrThrow({
  where: { organizationId: TEST_ORGANIZATION_ID, externalOfferId: '607635921546' },
});
expect(offer).toMatchObject({ minOrderQuantity: 2, supplierName: '샘플 공급사' });
expect(await prisma.sourcingEvidenceObservation.count()).toBe(1);
expect(await prisma.supplierOfferSkuSnapshot.count()).toBe(1);
```

Run: `rtk npm run test:integration --workspace=apps/server -- src/sourcing/adapter/in/http/__tests__/sourcing-extension-ingest.http.pg.integration.spec.ts`

Expected: FAIL because whitelist strips snake_case commercial fields and current endpoint does not require entitlement/evidence.

- [ ] **Step 2: v1/v2 shared schemas와 explicit translator를 구현한다.**

```typescript
import { z } from 'zod';

const NumericTextSchema = z.union([z.number(), z.string().min(1)]);
const PriceTierV1Schema = z.union([
  z.object({
    beginAmount: NumericTextSchema,
    price: NumericTextSchema,
  }).passthrough(),
  z.object({
    min_quantity: NumericTextSchema,
    max_quantity: NumericTextSchema.nullable().optional(),
    unit_price: NumericTextSchema,
  }).passthrough(),
]);

export const SourcingExtensionV1ProductSchema = z.object({
  page_type: z.enum(['detail', 'description', 'search']).optional(),
  source_url: z.string().url().max(2_000),
  source_platform: z.string().min(1).max(64),
  product_id: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  description_text: z.string().optional(),
  images: z.array(z.string().url()).max(200).default([]),
  description_images: z.array(z.string().url()).max(200).default([]),
  detail_images: z.array(z.string().url()).max(200).default([]),
  price_min: z.number().nonnegative().nullable().optional(),
  price_max: z.number().nonnegative().nullable().optional(),
  currency: z.string().min(3).max(8).optional(),
  moq: z.number().int().nonnegative().nullable().optional(),
  unit: z.string().max(60).optional(),
  sales_volume: z.number().int().nonnegative().nullable().optional(),
  supplier_name: z.string().max(300).nullable().optional(),
  seller_login_id: z.string().max(200).nullable().optional(),
  seller_user_id: z.string().max(200).nullable().optional(),
  seller_store_url: z.string().url().max(2_000).nullable().optional(),
  specs: z.union([z.array(z.record(z.unknown())), z.record(z.unknown())]).optional(),
  pack_info: z.array(z.record(z.unknown())).max(500).default([]),
  sku_attrs: z.array(z.unknown()).max(500).default([]),
  sku_list: z.array(z.unknown()).max(2_000).default([]),
  price_tiers: z.array(PriceTierV1Schema).max(500).default([]),
}).passthrough();

export const SourcingExtensionV2ProductSchema = z.object({
  schemaVersion: z.literal('2'),
  collectionSessionId: z.string().uuid(),
  sourcePlatform: z.enum(['1688', 'alibaba']),
  sourceUrl: z.string().url().max(2_000),
  externalOfferId: z.string().min(1).max(200),
  variantKey: z.string().max(300),
  title: z.string().min(1).max(500),
  capturedAt: z.string().datetime({ offset: true }),
  extractorVersion: z.string().min(1).max(120),
  priceMin: z.number().nonnegative().nullable(),
  priceMax: z.number().nonnegative().nullable(),
  minOrderQuantity: z.number().int().nonnegative().nullable(),
  supplierName: z.string().max(300).nullable(),
  skuAttributes: z.array(z.unknown()).max(500),
  skuItems: z.array(z.unknown()).max(2_000),
  priceTiers: z.array(z.object({
    minQuantity: z.number().int().positive(),
    maxQuantity: z.number().int().positive().nullable(),
    unitPriceCny: z.number().nonnegative(),
  }).strict()).max(500),
  rawPayloadHash: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();

export type SourcingExtensionV1Product = z.infer<typeof SourcingExtensionV1ProductSchema>;
export type SourcingExtensionV2Product = z.infer<typeof SourcingExtensionV2ProductSchema>;
```

Class-validator DTO에도 v1 snake_case field를 명시해 global whitelist에서 보존한다. Controller의 `{ ...body, ...extra }` flatten을 제거하고 `SourcingExtensionIngestService`가 v1/v2를 각각 canonical command로 번역한다. Unknown field count는 metric/log에만 남기고 commercial field를 `extra` escape hatch에서 추측하지 않는다.

- [ ] **Step 3: v1 commit gate와 v2 pre-issued session을 coordinator에 연결한다.**

- 기존 `POST /api/sourcing/extension/product-data`는 URL과 payload identity를 검증한 다음 platform에 맞는 `1688.product_extension/default` 또는 `alibaba.product_extension/default` entitlement로 inline run을 claim하고 commit한다. entitlement가 없거나 expired/killed면 candidate, image, evidence, offer를 모두 0건으로 유지한다.
- v1 성공 response의 `{ ok, message, product_count }` wire shape와 endpoint path는 바꾸지 않는다.
- `POST /api/sourcing/collection/sessions`는 authenticated organization/user, source, normalized target, schema version을 받아 v2 permit/session ID를 반환한다.
- `POST /api/sourcing/extension/v2/product-data`는 session ID, lease/generation, entitlement를 commit transaction에서 재검사한다.
- v1은 이미 배포되어 browser DOM read 전 server permit을 강제할 수 없다는 compatibility metric을 기록한다. v2 extension은 `COLLECT_CURRENT` 전에 session을 발급받는다.
- Candidate는 canonical source URL, external offer ID, normalized variant key의 server hash로 upsert한다. URL tracking parameter/title/array index를 candidate identity로 쓰지 않는다. `rawData`에는 whitelisted normalized commercial summary와 evidence ID만 두고 full raw payload는 evidence observation에 둔다.
- Supply offer 생성은 exported `SUPPLY_SOURCING_PROCUREMENT_PORT`만 사용하고 direct Prisma/Supply model mutation을 Sourcing service에 추가하지 않는다.

v1 entrypoint는 아래처럼 translator와 coordinator만 조합한다. v2도 동일 구조에서 `session.permit`을 사용한다.

```typescript
interface AuthenticatedSourcingContext {
  organizationId: string;
  userId: string;
}

interface ExtensionV1Response {
  ok: true;
  message: string;
  product_count: number;
}

async ingestV1(context: AuthenticatedSourcingContext, raw: unknown): Promise<ExtensionV1Response> {
  const product = SourcingExtensionV1ProductSchema.parse(raw);
  const command = translateExtensionV1Product(context, product);
  const result = await this.collectionCoordinator.execute(
    buildInlineExtensionClaim(command),
    async () => buildExtensionAuthorizedOutput(command),
  );
  return {
    ok: true,
    message: result.kind === 'existing' ? 'already collected' : 'collected',
    product_count: result.kind === 'existing' ? 0 : result.acceptedCount,
  };
}
```

- [ ] **Step 4: extension의 blind fetch를 exact allowlist policy로 막는다.**

`url-policy.js`는 service worker보다 먼저 load하고 다음 순수 함수를 노출한다.

```javascript
(function installSourcingUrlPolicy(global) {
  'use strict';

  const ALLOWED_SUFFIXES = ['1688.com', 'alibaba.com'];

  function isAllowedHost(hostname) {
    const normalized = String(hostname || '').toLowerCase().replace(/\.$/, '');
    return ALLOWED_SUFFIXES.some((suffix) =>
      normalized === suffix || normalized.endsWith(`.${suffix}`),
    );
  }

  function parseAllowedSupplierUrl(value) {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:') throw new Error('supplier_url_https_required');
    if (parsed.username || parsed.password) throw new Error('supplier_url_userinfo_forbidden');
    if (parsed.port && parsed.port !== '443') throw new Error('supplier_url_port_forbidden');
    if (!isAllowedHost(parsed.hostname)) throw new Error('supplier_url_host_forbidden');
    return parsed.toString();
  }

  global.KiditemSourcingUrlPolicy = Object.freeze({
    isAllowedHost,
    parseAllowedSupplierUrl,
  });
})(globalThis);
```

Worker는 `_detail_url`을 `parseAllowedSupplierUrl`로 검증하고 `fetch(url, { redirect: 'error', credentials: 'include' })`만 사용한다. validation failure나 redirect는 구조화 실패로 report하며 localhost/private URL을 요청하지 않는다. `service-worker.js` boot test가 module load order를 고정한다.

Nest의 `POST /api/sourcing/scrape-url`도 같은 HTTPS/host/userinfo/port policy를 domain 함수로 검증한다. Playwright runtime은 initial URL뿐 아니라 request/redirect hop마다 allowlisted supplier host만 계속 허용하며 localhost, loopback, private/link-local/metadata literal을 abort한다. Server와 extension policy spec은 동일한 accepted/rejected URL fixture table을 사용한다.

- [ ] **Step 5: assistant를 retrieval-only로 단순화하고 process spawn 경로를 삭제한다.**

현재 UI는 이미 `retrieval_only` mode를 표시하므로 화면 기능은 유지된다. `SourcingAssistantService.ask`는 canonical recommendation/interest/validation 문서를 검색한 결과만 반환한다.

```typescript
return {
  mode: 'retrieval_only',
  text: buildRetrievalOnlyText(retrieved),
  citations,
  documentCount: documents.length,
  model: null,
  degradedReason: '안전한 생성 runtime이 구성되지 않아 내부 근거 검색 결과만 표시합니다.',
  degradedCode: 'generation_disabled',
};
```

CLI port/adapter와 module provider를 삭제하고 child process import가 sourcing tree에 남지 않는 architecture test를 추가한다. `assistant-ask`에는 `@Throttle({ default: { limit: 20, ttl: 60_000 } })`를 적용하고 question 1,000자, visible context 8,000자 상한을 DTO에 둔다.

- [ ] **Step 6: extension/server contract와 보안 회귀 gate를 통과시키고 커밋한다.**

Run:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/sourcing/extension.spec.ts
rtk node --test extensions/tests/product-scraper/background-auth.test.mjs extensions/tests/product-scraper/sourcing-url-policy.test.mjs extensions/tests/kiditem-os-service-worker-boot.test.mjs
rtk npm run test:integration --workspace=apps/server -- src/sourcing/adapter/in/http/__tests__/sourcing-extension-ingest.http.pg.integration.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/sourcing/application/service/__tests__/sourcing-extension-ingest.service.spec.ts src/sourcing/domain/supplier-source-url-policy.spec.ts src/sourcing/adapter/out/runtime/__tests__/sourcing-playwright-runtime.handler.spec.ts src/sourcing/domain/__tests__/sourcing-assistant-retrieval.spec.ts src/sourcing/__tests__/sourcing.module.wiring.spec.ts
rtk npm run check:agents-hygiene
rtk npm run build --workspace=apps/server
```

Expected: actual v1 fixture commercial fields persist, v1/v2 unauthorized commit is 0 rows, all disallowed URL fetch counts are 0, sourcing tree has no `child_process`/CLI provider, all gates PASS.

```bash
rtk git add packages/shared/src/sourcing apps/server/src/sourcing extensions/kiditem-os extensions/tests docs/ARCHITECTURE.md
rtk git commit -m "fix: harden sourcing extension ingestion"
```

### Task 4: Server-owned recommendation, validation, review, rising, and RAG read models

**Files:**

- Create: `apps/server/src/sourcing/domain/sourcing-recommendation-identity.ts`
- Create: `apps/server/src/sourcing/domain/sourcing-recommendation-identity.spec.ts`
- Create: `apps/server/src/sourcing/domain/sourcing-validation-policy.ts`
- Create: `apps/server/src/sourcing/domain/sourcing-validation-policy.spec.ts`
- Create: `apps/server/src/sourcing/application/port/out/repository/sourcing-workspace.repository.port.ts`
- Create: `apps/server/src/sourcing/application/port/out/repository/sourcing-recommendation.repository.port.ts`
- Create: `apps/server/src/sourcing/application/port/out/repository/sourcing-validation.repository.port.ts`
- Create: `apps/server/src/sourcing/application/port/out/repository/sourcing-review.repository.port.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/sourcing-workspace.repository.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/sourcing-recommendation.repository.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/sourcing-validation.repository.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/sourcing-review.repository.adapter.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/__tests__/sourcing-workspace.repository.adapter.spec.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/__tests__/sourcing-recommendation.repository.adapter.spec.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/__tests__/sourcing-validation.repository.adapter.spec.ts`
- Create: `apps/server/src/sourcing/adapter/out/repository/__tests__/sourcing-review.repository.adapter.spec.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-recommendation.service.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-validation.service.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-review.service.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-workspace-read.service.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-recommendation.service.spec.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-validation.service.spec.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-review.service.spec.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-workspace-read.service.spec.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/dto/sourcing-workspace.dto.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/sourcing-workspace.controller.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/sourcing-review.controller.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/__tests__/sourcing-workspace.controller.spec.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/__tests__/sourcing-review.controller.spec.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-entry-recommendation.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-1688-new-product-model.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-market-model.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-market-discovery.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-rising-product.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-agent-rag.service.ts`
- Modify: `apps/server/src/sourcing/application/service/sourcing-assistant.service.ts`
- Modify: `apps/server/src/sourcing/adapter/out/runtime/sourcing-runtime.handler.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/operator-runtime.handler.ts`
- Modify: `apps/server/src/agent-os/application/service/operator-decision-executor.service.ts`
- Modify: `apps/server/src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts`
- Modify: `apps/server/src/agent-os/application/service/__tests__/operator-decision-executor.service.spec.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Create: `apps/server/src/sourcing/__tests__/sourcing-workspace-read-model.pg.integration.spec.ts`

**Interfaces:**

- Consumes: Tasks 1–3 canonical evidence/offer facts, stable candidate identity, `COUPANG_MOMENTUM_PORT` reads, and authorized collection run metadata.
- Produces: `recommendationItemKey`, `evaluateValidationEpisode`, `SourcingRecommendationService`, `SourcingValidationService`, `SourcingReviewService`, and the `/api/sourcing/workspace/*` envelopes/commands used by Tasks 5–7.

- [ ] **Step 1: stable identity, no-fabrication validation, and safe handoff failure tests를 작성한다.**

```typescript
it('normalizes platform, offer, and variant without URL or array-index identity', () => {
  expect(recommendationItemKey({
    sourcePlatform: ' 1688 ',
    externalOfferId: '607635921546 ',
    variantKey: 'Color=Pink',
    matchedCoupangProductId: null,
  })).toBe(recommendationItemKey({
    sourcePlatform: '1688',
    externalOfferId: '607635921546',
    variantKey: 'color=pink',
    matchedCoupangProductId: null,
  }));
});

it('does not fabricate margin when landed-cost inputs are incomplete', () => {
  expect(evaluateValidationEpisode({
    offerPriceCny: 12.5,
    exchangeRate: null,
    internationalShippingKrw: null,
    marketplaceFeeBps: null,
    targetSalePriceKrw: 29_900,
  })).toMatchObject({
    status: 'blocked',
    landedCostKrw: null,
    expectedMarginBps: null,
    missingCodes: ['exchange_rate', 'international_shipping', 'marketplace_fee'],
  });
});

it('creates only a review batch and never a procurement side effect', async () => {
  const result = await reviewService.createBatch(command);
  expect(result).toMatchObject({ status: 'awaiting_procurement_enablement', itemCount: 2 });
  expect(reviewRepository.createBatch).toHaveBeenCalledTimes(1);
  expect(reviewRepository.createBatch.mock.calls[0][0]).toMatchObject({
    organizationId: command.organizationId,
    recommendationRunId: command.recommendationRunId,
  });
});
```

Run: `rtk npm exec --workspace=apps/server vitest -- run src/sourcing/domain/sourcing-recommendation-identity.spec.ts src/sourcing/domain/sourcing-validation-policy.spec.ts src/sourcing/application/service/__tests__/sourcing-review.service.spec.ts`

Expected: FAIL because the new domain/service owners do not exist.

- [ ] **Step 2: server-only identity and versioned recommendation executor를 구현한다.**

```typescript
import { createHash } from 'node:crypto';

export interface RecommendationIdentityInput {
  sourcePlatform: string;
  externalOfferId: string;
  variantKey: string;
  matchedCoupangProductId: string | null;
}

export function recommendationItemKey(input: RecommendationIdentityInput): string {
  const identity = [
    input.sourcePlatform.trim().toLowerCase(),
    input.externalOfferId.trim(),
    input.variantKey.trim().toLowerCase(),
    input.matchedCoupangProductId?.trim() ?? '',
  ].join('\u001f');
  if (!input.externalOfferId.trim()) throw new TypeError('externalOfferId is required');
  return createHash('sha256').update(identity).digest('hex');
}

export interface ValidationEconomicsInput {
  offerPriceCny: number | null;
  exchangeRate: number | null;
  internationalShippingKrw: number | null;
  marketplaceFeeBps: number | null;
  targetSalePriceKrw: number | null;
}

export type ValidationEconomicsResult =
  | {
      status: 'blocked';
      landedCostKrw: null;
      expectedMarginBps: null;
      missingCodes: string[];
    }
  | {
      status: 'ready_for_review';
      landedCostKrw: number;
      expectedMarginBps: number;
      missingCodes: [];
    };

type CompleteValidationEconomicsInput = {
  [TKey in keyof ValidationEconomicsInput]: number;
};

function hasCompleteEconomics(
  input: ValidationEconomicsInput,
): input is CompleteValidationEconomicsInput {
  return Object.values(input).every((value) => value !== null);
}

export function evaluateValidationEpisode(
  input: ValidationEconomicsInput,
): ValidationEconomicsResult {
  if (hasCompleteEconomics(input)) {
    const landedCostKrw = Math.round(
      input.offerPriceCny * input.exchangeRate + input.internationalShippingKrw,
    );
    const marketplaceFeeKrw = Math.round(
      input.targetSalePriceKrw * input.marketplaceFeeBps / 10_000,
    );
    const expectedMarginBps = Math.round(
      (input.targetSalePriceKrw - landedCostKrw - marketplaceFeeKrw)
        / input.targetSalePriceKrw
        * 10_000,
    );
    return { status: 'ready_for_review', landedCostKrw, expectedMarginBps, missingCodes: [] };
  }
  const missingCodes = [
    input.offerPriceCny === null ? 'offer_price' : null,
    input.exchangeRate === null ? 'exchange_rate' : null,
    input.internationalShippingKrw === null ? 'international_shipping' : null,
    input.marketplaceFeeBps === null ? 'marketplace_fee' : null,
    input.targetSalePriceKrw === null ? 'target_sale_price' : null,
  ].filter((code): code is string => code !== null);
  return { status: 'blocked', landedCostKrw: null, expectedMarginBps: null, missingCodes };
}
```

`SourcingRecommendationService`는 exact cutoff에서 eligible terminal evidence와 Ads의 `COUPANG_MOMENTUM_PORT` read를 모으고 기존 versioned server model을 한 번 실행한다. `policyKey`, policy/model/calculation version, observation manifest hash를 run에 저장하고 item/evidence join을 같은 transaction에 insert한다. 동일 manifest run은 재사용하고 다른 browser/client score는 입력으로 받지 않는다.

- [ ] **Step 3: validation episode/check와 atomic selection/review batch repository를 구현한다.**

- validation check key는 `coupang_demand`, `competition`, `offer_identity`, `price_moq`, `supplier_freshness`, `landed_cost`, `kc_safety`, `ip_licensing`, `quality_readiness`, `observation_window`로 제한한다.
- check status는 `pass | fail | missing | pending | not_applicable`이다. 측정값과 단위, threshold rule version, evidence FK를 저장한다.
- 원가·환율·배송·수수료 중 하나라도 없으면 landed cost와 margin은 null이다. 숫자 91점/28.5% 같은 fallback을 만들지 않는다.
- selection upsert는 `(organizationId, workspaceKey, itemKey)`와 `expectedVersion` CAS를 사용하고 conflict는 `409 SELECTION_VERSION_CONFLICT`로 반환한다.
- review batch create는 request hash/idempotency key를 검증하고 selected item이 최신 eligible recommendation run에 있으며 validation이 stale하지 않은지 transaction에서 다시 확인한다.
- `SourcingReviewService`와 repository는 Supply procurement port, PO service, provider adapter를 import하지 않는다. architecture test로 금지한다.
- PG integration은 review batch 전후 `procurement_test_intents`와 `purchase_orders` count가 모두 0인지 확인한다.

Repository ports는 아래 command boundary로 고정한다. 구현 adapter는 모든 read/write 조건에 `organizationId`를 포함한다.

```typescript
export interface SaveReviewSelectionCommand {
  organizationId: string;
  workspaceKey: 'entry' | 'final';
  recommendationRunId: string;
  itemKey: string;
  state: 'neutral' | 'selected' | 'removed';
  expectedVersion: number;
  actorUserId: string;
}

export interface CreateReviewBatchCommand {
  organizationId: string;
  recommendationRunId: string;
  itemKeys: string[];
  idempotencyKey: string;
  requestHash: string;
  requestedByUserId: string;
}

export interface SourcingReviewBatchResult {
  id: string;
  status: 'awaiting_procurement_enablement' | 'cancelled';
  itemCount: number;
  duplicate: boolean;
}

export interface SourcingReviewRepositoryPort {
  saveSelection(command: SaveReviewSelectionCommand): Promise<SourcingReviewSelection>;
  createBatch(command: CreateReviewBatchCommand): Promise<SourcingReviewBatchResult>;
}
```

- [ ] **Step 4: screen-specific read endpoints와 cursor contract를 추가한다.**

```text
GET    /api/sourcing/workspace/home
GET    /api/sourcing/workspace/market
GET    /api/sourcing/workspace/keywords
GET    /api/sourcing/workspace/recommendations?surface=final&limit=50&cursor=eyJjIjoiMjAyNi0wOC0wOFQwMDowMDowMC4wMDBaIiwiaWQiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ
GET    /api/sourcing/workspace/validation?limit=50&cursor=eyJjIjoiMjAyNi0wOC0wOFQwMDowMDowMC4wMDBaIiwiaWQiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ
GET    /api/sourcing/workspace/interests
POST   /api/sourcing/workspace/interests
PATCH  /api/sourcing/workspace/interests/:id
DELETE /api/sourcing/workspace/interests/:id?version=3
GET    /api/sourcing/workspace/review-selections?workspaceKey=entry&recommendationRunId=11111111-1111-4111-8111-111111111111
PUT    /api/sourcing/workspace/review-selections/:itemKey
POST   /api/sourcing/workspace/review-batches
GET    /api/sourcing/workspace/review-batches/:id
```

`surface`는 `home | today | entry | final`만 허용하며 모두 같은 eligible recommendation run에서 presenter projection만 달리한다.

각 GET은 `SourcingReadEnvelope<T>`를 반환하고 list cursor는 `(completedAt/capturedAt, id)`를 opaque base64url JSON으로 encode한다. limit 기본 50, 최대 100이다. Unknown/malformed row는 ingest에서 quarantine하며 한 row 때문에 org read 전체가 500이 되지 않는다.

- [ ] **Step 5: 기존 model/RAG service를 canonical repository에 위임한다.**

- Entry, Home, Today, Final은 같은 latest eligible recommendation run을 surface presenter로 직렬화한다.
- Rising `detect()`와 `getLatest()`는 같은 persisted run fields인 confidence, coverage, data gaps를 반환한다. `model.stats.keywordCount`를 Naver trend count로 재해석하지 않는다.
- Market discovery와 REST market model은 interest와 recommendation input을 같은 service에서 받는다. AgentOS 경로가 interest를 누락하지 않는다.
- RAG index key는 `organizationId + inputManifestHash + days + cutoffAt + schemaVersion` hash다. interest/recommendation/validation mutation이 관련 projection을 invalidate한다.
- Assistant retrieval은 workspace JSON이 아니라 interest/recommendation/validation repository에서 문서를 만든다.
- 기존 canonical launch/decision/intents API는 유지하지만 새 14-screen read model이 호출하지 않는다.
- AgentOS operator와 `sourcing-runtime.handler.ts`의 누락 keyword fallback `실리콘 식판`을 삭제한다. URL 없는 sourcing discovery는 canonical discovery input schema의 non-empty keyword를 요구하고, 누락/비소싱 문장은 artifact를 만들지 않은 채 deterministic `ask_user` 결과를 반환한다.

RAG key와 AgentOS validation은 silent fallback 없이 다음 순수 계약을 공유한다.

```typescript
export function sourcingRagIndexKey(input: {
  organizationId: string;
  inputManifestHash: string;
  days: number;
  cutoffAt: string;
  schemaVersion: string;
}): string {
  const canonical = JSON.stringify(Object.fromEntries(
    Object.entries(input).sort(([left], [right]) => left.localeCompare(right)),
  ));
  return createHash('sha256').update(canonical).digest('hex');
}

export const SourcingDiscoveryInputSchema = z.object({
  keyword: z.string().trim().min(1).max(160),
}).strict();

export function requireSourcingDiscoveryKeyword(input: unknown): string {
  return SourcingDiscoveryInputSchema.parse(input).keyword.trim();
}
```

- [ ] **Step 6: PG read-model/organization isolation tests와 focused suite를 통과시키고 커밋한다.**

PG integration은 cross-org item/selection/batch read가 0건/404인지, concurrent selection CAS가 한 winner만 갖는지, latest cursor가 stable한지, malformed quarantined observation을 skip하는지 확인한다.

Run:

```bash
rtk npm exec --workspace=apps/server vitest -- run src/sourcing/domain/sourcing-recommendation-identity.spec.ts src/sourcing/domain/sourcing-validation-policy.spec.ts src/sourcing/application/service/__tests__/sourcing-recommendation.service.spec.ts src/sourcing/application/service/__tests__/sourcing-validation.service.spec.ts src/sourcing/application/service/__tests__/sourcing-review.service.spec.ts src/sourcing/application/service/__tests__/sourcing-rising-product.service.spec.ts src/sourcing/application/service/__tests__/sourcing-agent-rag.service.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/agent-os/adapter/out/runtime/__tests__/operator-runtime.handler.spec.ts src/agent-os/application/service/__tests__/operator-decision-executor.service.spec.ts
rtk npm run test:integration --workspace=apps/server -- src/sourcing/__tests__/sourcing-workspace-read-model.pg.integration.spec.ts
rtk npm exec --workspace=apps/server vitest -- run src/sourcing/__tests__/sourcing.architecture.spec.ts src/sourcing/__tests__/sourcing.module.wiring.spec.ts
rtk npm run build --workspace=apps/server
```

Expected: stable identity, no fabricated validation values, org isolation, cursor, rising round-trip, RAG invalidation, no procurement side effect all PASS.

```bash
rtk git add apps/server/src/sourcing apps/server/src/agent-os
rtk git commit -m "feat: add sourcing recommendation validation and review models"
```

### Task 5: Cut research and collection screens over to server state without visual redesign

**Files:**

- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/sourcing-workspace-api.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/sourcing-workspace-api.spec.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/hooks/use-sourcing-workspace.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/hooks/use-sourcing-workspace.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingReadState.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingReadState.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/purge-legacy-sourcing-cache.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/purge-legacy-sourcing-cache.spec.ts`
- Modify: `apps/web/src/lib/query-keys.ts`
- Modify: `apps/web/src/lib/manual-operation-actions.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingHomeHero.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SourcingHomeRecommendationRail.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/components/GlobalSourcingOverview.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/components/TrendCollectionSection.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochMarketAnalysisPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/components/KeywordAnalysisPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/components/InterestKeywordManager.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/category-sourcing/components/ToyCategorySourcingPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/rising-products/components/RisingProductsPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/recommendations/components/TodayRecommendationsPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleKeywordSearch.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleCoupangMatches.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochWholesaleRankingTabs.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochSourcingPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochSourcingSettingsPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/product-tracking/components/ProductTrackingPage.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/product-tracking/lib/refresh-tracked-products.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/product-tracking/lib/refresh-tracked-products.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/components/MarketIntelligencePage.spec.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/live-naver-market.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/market/lib/live-sns-market.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/keywords/components/keyword-analysis-helpers.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/rising-products/lib/rising-products-api.spec.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/recommendations/lib/today-recommendations.spec.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/sourcing-research-routes.spec.tsx`

**Interfaces:**

- Consumes: Task 4 workspace read envelopes, interest/collection commands, operation status, and existing Ads-owned APIs for competitor/Wing tracking screens.
- Produces: `fetchSourcingRecommendations`, `saveReviewSelection`, organization-aware `queryKeys.sourcing`, the `use-sourcing-workspace` hook family, and `SourcingReadState` used by all 14 routes and Task 6.

- [ ] **Step 1: org-scoped query, error-vs-empty, and legacy-cache rejection tests를 작성한다.**

```typescript
it('uses organization identity in the query key without sending it to the API', async () => {
  renderHook(() => useSourcingRecommendations('today'), { wrapper: wrapperFor('org-a') });
  expect(queryClient.getQueryCache().find({
    queryKey: ['sourcing', 'workspace', 'org-a', 'recommendations', 'today'],
  })).toBeDefined();
  expect(apiGet).toHaveBeenCalledWith(
    '/api/sourcing/workspace/recommendations?surface=today&limit=50',
    expect.anything(),
  );
  expect(apiGet.mock.calls[0][0]).not.toContain('org-a');
});

it('does not render unavailable as a successful empty state', () => {
  render(<SourcingReadState envelope={unavailableEnvelope} emptyLabel="추천이 없습니다" />);
  expect(screen.getByText('수집 권한을 확인해 주세요')).toBeVisible();
  expect(screen.queryByText('추천이 없습니다')).not.toBeInTheDocument();
});

it('purges every authoritative legacy sourcing key and prefix once', () => {
  seedLegacySourcingStorage();
  purgeLegacySourcingCache(localStorage);
  expect([...storageKeys(localStorage)].filter(isLegacySourcingKey)).toEqual([]);
  expect(localStorage.getItem('kiditem:sourcing-cache-schema')).toBe('2');
});
```

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(sourcing-ai)/sourcing-ai/lib/sourcing-workspace-api.spec.ts' 'src/app/(sourcing-ai)/sourcing-ai/hooks/use-sourcing-workspace.spec.tsx' 'src/app/(sourcing-ai)/sourcing-ai/components/SourcingReadState.spec.tsx' 'src/app/(sourcing-ai)/sourcing-ai/lib/purge-legacy-sourcing-cache.spec.ts'`

Expected: FAIL because the common client/hook/state component do not exist and old global caches are still read.

- [ ] **Step 2: one parsed API client and React Query hook family를 구현한다.**

`sourcing-workspace-api.ts`만 새 workspace endpoints를 호출한다. 모든 response는 focused shared schema로 parse한다.

```typescript
export function fetchSourcingRecommendations(
  surface: 'home' | 'today' | 'entry' | 'final',
  limit = 50,
): Promise<SourcingRecommendationEnvelope> {
  return apiClient.getParsed(
    `/api/sourcing/workspace/recommendations?surface=${surface}&limit=${limit}`,
    SourcingRecommendationEnvelopeSchema,
  );
}

export function saveReviewSelection(
  itemKey: string,
  command: SourcingReviewSelectionCommand,
): Promise<SourcingReviewSelection> {
  return apiClient.put<unknown>(
    `/api/sourcing/workspace/review-selections/${encodeURIComponent(itemKey)}`,
    command,
  ).then((raw) => SourcingReviewSelectionSchema.parse(raw));
}

export function createReviewBatch(
  command: SourcingReviewBatchCommand,
): Promise<SourcingReviewBatch> {
  return apiClient.post<unknown>('/api/sourcing/workspace/review-batches', command)
    .then((raw) => SourcingReviewBatchSchema.parse(raw));
}

export const sourcingWorkspaceKeys = {
  root: (organizationId: string) => ['sourcing', 'workspace', organizationId] as const,
  recommendations: (
    organizationId: string,
    surface: 'home' | 'today' | 'entry' | 'final',
  ) => [...sourcingWorkspaceKeys.root(organizationId), 'recommendations', surface] as const,
  selections: (
    organizationId: string,
    workspaceKey: 'entry' | 'final',
    recommendationRunId: string,
  ) => [...sourcingWorkspaceKeys.root(organizationId), 'selections', workspaceKey, recommendationRunId] as const,
  validation: (organizationId: string) =>
    [...sourcingWorkspaceKeys.root(organizationId), 'validation'] as const,
  interests: (organizationId: string) =>
    [...sourcingWorkspaceKeys.root(organizationId), 'interests'] as const,
};
```

`queryKeys.sourcing`는 위 factory를 포함하고 organization-aware `home`, `market`, `keywords`, `reviewBatch` sibling key도 같은 root 아래에 추가한다. `useAuth().user.organizationId`는 query identity에만 사용하고 request body/query에는 넣지 않는다. Mutation success는 exact family만 invalidate한다.

- [ ] **Step 3: legacy browser/workspace ownership을 제거한다.**

Cutover 첫 sourcing mount에서 다음 exact key/prefix를 한 번 제거하고 schema marker를 `2`로 기록한다.

```typescript
export const LEGACY_SOURCING_KEYS = [
  'kiditem:sourcing-ai:today-recommendation:rows',
  'kiditem:sourcing-ai:today-recommendation:rows:v1',
  'kiditem:sourcing-ai:today-recommendation:snapshots',
  'kiditem:sourcing-ai:today-recommendation:snapshots:v1',
  'kiditem:sourcing-ai:final-selection:1688:v1',
  'kiditem:sourcing-ai:keyword-analysis:trend-keyword-agent:v1',
  'kiditem:sourcing-ai:keyword-analysis:ranked-keyword-pool:v1',
  'kiditem_keyword_exclude',
] as const;

export const LEGACY_SOURCING_PREFIXES = [
  'kiditem:sourcing-ai:1688-image-search:daily:',
] as const;
```

다음 client canonical writers/readers는 마지막 consumer를 옮긴 직후 삭제한다.

```text
apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/sourcing-workspace-snapshot-api.ts
apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/sourcing-interest-tracking.ts
apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/1688-new-product-snapshot.ts
apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/daily-image-search-cache.ts
apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/use-today-recommendation-rows.ts
```

`today-recommendations.ts`는 presenter formatting만 남기고 score, grade, decision, local persistence를 제거한다. GET→merge→PUT는 모두 keyed server command로 교체한다.

- [ ] **Step 4: Home/Market/Keyword/Category/Rising/Today/Wholesale/Settings를 공통 envelope에 연결한다.**

- Home은 server home/recommendation/rising envelope와 Ads rank query를 조합하되 local recommendation rail을 우선하지 않는다.
- Market의 live tabs는 server market/trend read model을 사용한다. competitor fixture 탭의 기존 “실시간 연동 아님” 표시는 유지한다. Wing collection 완료는 client snapshot 전체 replace 대신 typed ingest command를 호출한다.
- Keyword의 API orchestration/persist logic은 hook으로 이동하고 component는 tab/form/table presenter로 축소한다. 제외 상태는 server review/interest command에 저장한다.
- Category는 공용 trend contract를 사용하고 축약된 `toy-trend-api.ts` duplicate type을 제거한다.
- Rising detect 성공은 rising query family와 Home family를 동시에 invalidate하고 POST/GET의 confidence/gaps가 같은 값을 표시한다.
- Today는 server recommendation run만 읽고 Extension 수집은 collection run ID를 추적한다. tab close/reload 후 active run을 복구한다.
- Extension collection terminal commit이 server-side recommendation operation을 idempotently trigger한다. 15분 client promise 완료 뒤 snapshot finalize하는 callback은 제거해 tab close/reload가 derived run 생성을 잃지 않게 한다.
- Wholesale keyword/image 결과는 server typed observation을 읽는다. 관심 키워드 bulk 수집은 `demand_only` target을 먼저 필터한 뒤 최대 20개를 수집한다.
- Settings add/remove는 versioned interest command를 사용한다.
- SearchHero와 ranking filter는 실제 query/filter state에 연결한다. backend contract가 없는 image upload control은 이유가 보이는 disabled state로 둔다.

각 route presenter는 동일한 상태 분기를 사용하고 `data === null`을 빈 결과로 바꾸지 않는다.

```tsx
const recommendation = useSourcingRecommendations(surface);
return (
  <SourcingReadState envelope={recommendation.data} error={recommendation.error}>
    {(ready) => <SourcingHomeRecommendationRail rows={ready.items} />}
  </SourcingReadState>
);
```

- [ ] **Step 5: Ads-owned 3개 화면의 경계를 유지하면서 refresh fan-out만 제한한다.**

Competitor/Wing Catalog/Product Tracking 데이터는 Ads owner에 남긴다. Sourcing candidate를 자동 생성하지 않는다. Product Tracking의 extension refresh는 worker pool 4개로 제한하고 item별 success/failure를 집계해 전체 실패를 성공 toast로 표시하지 않는다. query error는 빈 목록이 아니라 `SourcingReadState`와 같은 error semantics로 표시한다.

```typescript
export async function refreshTrackedProducts(
  productIds: readonly string[],
  refreshOne: (productId: string) => Promise<void>,
): Promise<Array<{ id: string; status: 'succeeded' | 'failed'; message: string | null }>> {
  const results = new Array<{ id: string; status: 'succeeded' | 'failed'; message: string | null }>(productIds.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < productIds.length) {
      const index = cursor++;
      const id = productIds[index];
      try {
        await refreshOne(id);
        results[index] = { id, status: 'succeeded', message: null };
      } catch (error: unknown) {
        results[index] = {
          id,
          status: 'failed',
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, productIds.length) }, worker));
  return results;
}
```

- [ ] **Step 6: mount/re-entry operation recovery와 14-route visual contract를 검증한다.**

`startTrendCollectionAction`은 org-scoped session key에 caller UUID를 저장해 terminal 확인 전 refresh/re-entry가 같은 `Idempotency-Key`를 재사용하게 한다. terminal 뒤 key를 지워 다음 명시적 수집은 새 run을 만들 수 있다. Coordinator active target constraint가 multi-tab race의 최종 방어선이다.

Route test는 sidebar 14개 href가 유지되고 research/collection 화면의 heading, tab label, 주요 CTA가 그대로 존재하는지 확인한다. `ready`, `collecting`, `stale`, `unavailable` fixture를 각각 렌더한다.

Run:

```bash
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(sourcing-ai)/sourcing-ai'
rtk npm exec --workspace=apps/web vitest -- run src/components/layout/__tests__/Sidebar.product-pipeline.spec.ts
rtk npm run build --workspace=apps/web
```

Expected: sourcing web suite and production build PASS; no current component imports the deleted snapshot/local scorer modules.

- [ ] **Step 7: cache/snapshot ownership scan 후 커밋한다.**

Run:

```bash
rtk rg -n "saveTodaySourcingWorkspaceSnapshot|append1688NewProductSnapshot|FINAL_SELECTION_STORAGE_KEY|TODAY_RECOMMENDATION_ROWS_STORAGE_KEY|kiditem_keyword_exclude" apps/web/src/app/'(sourcing-ai)'/sourcing-ai
rtk npm run check:web-db-boundary
```

Expected: `rg` returns no matches and boundary check PASS.

```bash
rtk git add apps/web/src/app/'(sourcing-ai)'/sourcing-ai apps/web/src/lib/query-keys.ts apps/web/src/lib/manual-operation-actions.ts
rtk git commit -m "refactor: move sourcing research screens to server state"
```

### Task 6: Persist Entry selection, replace validation fixture, and make Final handoff real but non-procurement

**Files:**

- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/lib/entry-recommendation-api.ts`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationTable.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationDetail.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/page.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/validation/page.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochValidationPage.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochValidationPage.spec.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochSourcingPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochFinalSelectionPage.tsx`
- Modify: `apps/web/src/app/(sourcing-ai)/sourcing-ai/lib/final-selection-chat.ts`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/components/SellochFinalSelectionPage.spec.tsx`
- Create: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.spec.tsx`
- Delete after route regression passes: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/SourcingDecisionCenterPage.tsx`
- Delete after import scan passes: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/DecisionChatCards.tsx`
- Delete after import scan passes: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/DecisionCandidateCards.tsx`
- Delete after import scan passes: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/DecisionWorkspacePanel.tsx`
- Delete after import scan passes: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/lib/sourcing-decision-center.ts`
- Delete after import scan passes: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/lib/decision-center-chat.ts`
- Delete after import scan passes: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/lib/decision-center-presenter.ts`
- Delete after import scan passes: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/lib/sourcing-intelligence-api.ts`
- Delete: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/components/DecisionCandidateCards.spec.tsx`
- Delete: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/lib/sourcing-decision-center.spec.ts`
- Delete: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/lib/decision-center-chat.spec.ts`
- Delete: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/lib/decision-center-presenter.spec.ts`
- Delete: `apps/web/src/app/(sourcing-ai)/sourcing-ai/decision-center/lib/sourcing-intelligence-api.spec.ts`
- Modify: `apps/server/src/sourcing/__tests__/sourcing.architecture.spec.ts`

**Interfaces:**

- Consumes: Tasks 4–5 recommendation, validation, selection, assistant, and review-batch APIs/hooks.
- Produces: server-persisted Entry selection UX, real validation presenter, and Final `createReviewBatch({ recommendationRunId, itemKeys, idempotencyKey })` handoff whose only durable side effect is `SourcingReviewBatch` plus immutable items.

- [ ] **Step 1: persisted selection, real validation, and safe batch UI failure tests를 작성한다.**

```typescript
it('restores selected and removed rows from the server after remount', async () => {
  server.use(selectionResponse({ selected: [ITEM_A], removed: [ITEM_B] }));
  const first = render(<EntryRecommendationBoard />);
  expect(await screen.findByRole('checkbox', { name: /상품 A 선택/ })).toBeChecked();
  first.unmount();
  render(<EntryRecommendationBoard />);
  expect(await screen.findByRole('checkbox', { name: /상품 A 선택/ })).toBeChecked();
  expect(screen.queryByText('상품 B')).not.toBeInTheDocument();
});

it('shows missing evidence instead of fixture score and margin', async () => {
  server.use(validationResponse({ status: 'blocked', score: null, expectedMarginBps: null }));
  render(<SellochValidationPage />);
  expect(await screen.findByText('자료 없음')).toBeVisible();
  expect(screen.queryByText('91점')).not.toBeInTheDocument();
  expect(screen.queryByText('28.5%')).not.toBeInTheDocument();
});

it('creates a review batch and displays its id without claiming an order', async () => {
  server.use(reviewBatchResponse({
    id: '11111111-1111-4111-8111-111111111111',
    status: 'awaiting_procurement_enablement',
    itemCount: 2,
  }));
  render(<SellochFinalSelectionPage />);
  await user.click(await screen.findByRole('button', { name: '발주 에이전트로 보내기' }));
  expect(await screen.findByText(/11111111-1111-4111-8111-111111111111/)).toBeVisible();
  expect(screen.getByText('발주 활성화 대기')).toBeVisible();
  expect(screen.queryByText('발주가 생성되었습니다')).not.toBeInTheDocument();
});
```

Run: `rtk npm exec --workspace=apps/web vitest -- run 'src/app/(sourcing-ai)/sourcing-ai/decision-center/components/EntryRecommendationBoard.spec.tsx' 'src/app/(sourcing-ai)/sourcing-ai/components/SellochValidationPage.spec.tsx' 'src/app/(sourcing-ai)/sourcing-ai/components/SellochFinalSelectionPage.spec.tsx'`

Expected: FAIL because selection is component-local, validation is fixture-backed, and Final button has no command.

- [ ] **Step 2: Entry의 local Set을 server selection mutation으로 교체한다.**

- Entry recommendation과 selection queries를 동시에 hydrate한다.
- row selection/removal은 optimistic UI 후 versioned PUT을 호출한다. `409 SELECTION_VERSION_CONFLICT`면 exact selection query를 refetch하고 충돌 안내를 표시한다.
- no-URL/no-offer row는 server가 recommendation item으로 만들지 않으므로 array-index ID fallback을 삭제한다.
- clickable `<tr>`는 button/checkbox control을 제공하고 Enter/Space로 동일 action을 실행한다.
- 관심 키워드 수집은 실제 `demand_only` list만 target으로 전달하고 item별 run/error를 보여준다.

```typescript
const selectionQueryKey = sourcingWorkspaceKeys.selections(
  organizationId,
  'entry',
  recommendationRunId,
);
const selectionMutation = useMutation({
  mutationFn: (next: SourcingReviewSelectionCommand) =>
    saveReviewSelection(next.itemKey, next),
  onError: (error) => {
    if (isApiError(error) && error.code === 'SELECTION_VERSION_CONFLICT') {
      void queryClient.invalidateQueries({ queryKey: selectionQueryKey });
      toast.error('다른 화면에서 선택 상태가 변경되었습니다. 최신 상태를 불러왔습니다.');
    }
  },
});
```

- [ ] **Step 3: validation route를 real episode/check presenter로 바꾼다.**

`validation/page.tsx`는 `SellochValidationPage`를 직접 렌더한다. 기존 table column과 badge 위치는 유지하되 다음 mapping만 사용한다.

```typescript
export function formatValidationValue(
  value: number | null,
  unit: 'score' | 'percent' | 'krw',
): string {
  if (value === null) return '자료 없음';
  if (unit === 'score') return `${value}점`;
  if (unit === 'percent') return `${(value / 100).toFixed(1)}%`;
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}
```

`sourcingRows` fixture와 `SourcingDecisionRow` parallel contract를 `sourcing-ai-dashboard.ts`에서 제거한다. status/reason/action은 server validation check를 표시하며 missing/pending을 숫자로 대체하지 않는다.

- [ ] **Step 4: Final을 latest recommendation + validation + selection read model로 단순화한다.**

- local rows/server candidates를 점수순 merge하는 code와 client `order | observe_3d | exclude` 계산을 삭제한다.
- latest eligible recommendation run의 selected rows만 표시한다. stale/missing validation은 handoff를 막고 이유를 row와 CTA 근처에 표시한다.
- assistant prompt는 current item keys와 server citations만 사용하고 local fake snapshot ID를 보내지 않는다.
- `발주 에이전트로 보내기`는 caller-generated UUID idempotency key와 exact recommendation run/item keys로 review batch POST를 호출한다.
- success UI는 batch ID, item count, `awaiting_procurement_enablement`를 표시한다. PO/intent/provider 성공 문구를 쓰지 않는다.

```typescript
const reviewBatchKeyRef = useRef(crypto.randomUUID());
const createBatch = useMutation({
  mutationFn: () => createReviewBatch({
    recommendationRunId: recommendation.runId,
    itemKeys: selectedReadyItems.map((item) => item.itemKey),
    idempotencyKey: reviewBatchKeyRef.current,
  }),
  onSuccess: (batch) => setCreatedBatch(batch),
});

const handoffDisabled = selectedReadyItems.length === 0
  || selectedReadyItems.some((item) => item.validation.status !== 'ready_for_review');
```

- [ ] **Step 5: route-disconnected canonical UI를 regression gate 뒤 제거한다.**

현재 `/decision-center`가 계속 `EntryRecommendationBoard`를 렌더하고 launch/decision/procurement mutation을 호출하지 않는 route test를 먼저 고정한다. 그 뒤 import 0회인 `SourcingDecisionCenterPage`와 그 화면만 쓰는 component/lib를 삭제한다. Server의 canonical intelligence API와 domain models는 삭제하지 않는다.

Run:

```bash
rtk rg -n "SourcingDecisionCenterPage|createSourcingDecisionBatch|createProcurementIntent" apps/web/src/app/'(sourcing-ai)'/sourcing-ai
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(sourcing-ai)/sourcing-ai/decision-center' 'src/app/(sourcing-ai)/sourcing-ai/components/SellochValidationPage.spec.tsx' 'src/app/(sourcing-ai)/sourcing-ai/components/SellochFinalSelectionPage.spec.tsx'
rtk npm exec --workspace=apps/server vitest -- run src/sourcing/__tests__/sourcing.architecture.spec.ts src/sourcing/application/service/__tests__/sourcing-review.service.spec.ts
rtk npm run build --workspace=apps/web
```

Expected: `rg` has no production caller of canonical decision/procurement mutation, UI tests/build PASS, server architecture test proves review service has no Supply/PO/provider dependency.

- [ ] **Step 6: validation/final cutover를 커밋한다.**

```bash
rtk git add apps/web/src/app/'(sourcing-ai)'/sourcing-ai apps/server/src/sourcing/__tests__/sourcing.architecture.spec.ts
rtk git commit -m "feat: persist sourcing review and validation workflow"
```

### Task 7: Guarded clean reset, reviewed entitlement bootstrap, retention, cleanup, and atomic cutover

**Files:**

- Create: `scripts/data-migrations/plan.ts`
- Modify: `scripts/data-migrations/types.ts`
- Modify: `scripts/run-data-migrations.ts`
- Modify: `scripts/__tests__/run-data-migrations.spec.ts`
- Create: `scripts/data-migrations/v0.1.30/005_reset_sourcing_runtime_state.ts`
- Create: `scripts/__tests__/sourcing-runtime-reset-migration.spec.ts`
- Modify: `scripts/data-migrations/index.ts`
- Modify: `scripts/data-migrations/README.md`
- Modify: `scripts/README.md`
- Create: `apps/server/src/sourcing/domain/sourcing-source-manifest.ts`
- Create: `apps/server/src/sourcing/domain/sourcing-source-manifest.spec.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-bootstrap.service.ts`
- Create: `apps/server/src/sourcing/application/service/sourcing-retention.service.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-bootstrap.service.spec.ts`
- Create: `apps/server/src/sourcing/application/service/__tests__/sourcing-retention.service.spec.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/dto/sourcing-control.dto.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/sourcing-control.controller.ts`
- Create: `apps/server/src/sourcing/adapter/in/http/__tests__/sourcing-control.controller.spec.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/sourcing-bootstrap.operation-handler.ts`
- Create: `apps/server/src/sourcing/adapter/in/operation/__tests__/sourcing-bootstrap.operation-handler.spec.ts`
- Modify: `apps/server/src/sourcing/domain/operation/sourcing.operations.ts`
- Modify: `apps/server/src/sourcing/sourcing.module.ts`
- Create: `apps/server/src/sourcing/__tests__/sourcing-reset.pg.integration.spec.ts`
- Create: `apps/server/src/sourcing/__tests__/sourcing-performance.pg.integration.spec.ts`
- Modify: `prisma/models/sourcing.prisma`
- Modify: `prisma/models/core.prisma`
- Delete after reset tests pass: `apps/server/src/sourcing/adapter/in/http/sourcing-workspace-snapshot.controller.ts`
- Delete after reset tests pass: `apps/server/src/sourcing/adapter/in/http/__tests__/sourcing-workspace-snapshot.controller.spec.ts`
- Delete after cutover tests pass: `apps/server/src/sourcing/adapter/in/http/trend-collection.controller.ts`
- Delete after cutover tests pass: `apps/server/src/sourcing/adapter/in/http/__tests__/trend-collection.controller.spec.ts`
- Delete after consumer scan passes: `apps/server/src/sourcing/adapter/in/http/sourcing-market-model.controller.ts`
- Delete after consumer scan passes: `apps/server/src/sourcing/adapter/in/http/dto/sourcing-market-model.dto.ts`
- Delete after consumer scan passes: `apps/server/src/sourcing/adapter/in/http/sourcing-1688-new-product-model.controller.ts`
- Delete after consumer scan passes: `apps/server/src/sourcing/adapter/in/http/dto/sourcing-1688-new-product-model.dto.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-rising-product.controller.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/dto/sourcing-rising-product.dto.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/sourcing-agent-rag.controller.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/dto/sourcing-agent-rag.dto.ts`
- Modify: `apps/server/src/sourcing/adapter/in/http/dto/index.ts`
- Create: `docs/runbooks/sourcing-backend-cutover.md`
- Modify: `docs/runbooks/README.md`
- Modify: `docs/runbooks/office-deploy.md`
- Modify: `docs/runbooks/environment-variables.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `apps/server/src/sourcing/AGENTS.md`

**Interfaces:**

- Consumes: every canonical schema/service/API from Tasks 1–6 plus the existing data-migration runner and Operations registry.
- Produces: `migrationPlanHash`, `assertApprovedMigrationPlan`, pre-schema reset migration `v0.1.30:005_reset_sourcing_runtime_state`, `SourcingSourceManifestSchema`, `/api/sourcing/control/status|initialize`, bootstrap/retention operations, and the atomic Office cutover runbook.

- [ ] **Step 1: release train과 destructive scope를 assert한 뒤 migration plan-hash 실패 tests를 작성한다.**

Run:

```bash
rtk node -e "const fs=require('node:fs'); if(fs.readFileSync('VERSION','utf8').trim()!=='0.1.30') process.exit(1)"
rtk node -e "const fs=require('node:fs'); if(fs.existsSync('scripts/data-migrations/v0.1.30/005_reset_sourcing_runtime_state.ts')) process.exit(1)"
```

Expected: both commands exit 0. If either fails, stop and change the migration directory/id to the active open train's next sequence before writing code.

Runner tests:

```typescript
it('requires the exact reviewed plan hash for the one destructive plan', () => {
  const result = {
    affectedRows: 2,
    details: { purgeCounts: { sourcing_workspace_snapshots: 2 } },
  };
  const plan: PlannedDataMigration = {
    migrationId: destructiveMigration.id,
    result,
    planHash: migrationPlanHash(destructiveMigration.id, result),
    requiresPlanApproval: true,
  };

  expect(() => assertApprovedMigrationPlan({
    plans: [plan],
    approvedPlanHash: '0'.repeat(64),
  })).toThrow('approved data migration plan hash does not match');

  expect(() => assertApprovedMigrationPlan({
    plans: [plan],
    approvedPlanHash: plan.planHash,
  })).not.toThrow();
});

it('refuses one approval hash for multiple pending destructive plans', () => {
  const result = { affectedRows: 0, details: {} };
  const first: PlannedDataMigration = {
    migrationId: destructiveMigration.id,
    result,
    planHash: migrationPlanHash(destructiveMigration.id, result),
    requiresPlanApproval: true,
  };
  const second: PlannedDataMigration = {
    migrationId: secondDestructiveMigration.id,
    result,
    planHash: migrationPlanHash(secondDestructiveMigration.id, result),
    requiresPlanApproval: true,
  };

  expect(() => assertApprovedMigrationPlan({
    plans: [first, second],
    approvedPlanHash: first.planHash,
  })).toThrow('exactly one pending migration may require plan approval');
});
```

Run: `rtk npm exec vitest -- run --config scripts/vitest.config.ts scripts/__tests__/run-data-migrations.spec.ts scripts/__tests__/sourcing-runtime-reset-migration.spec.ts`

Expected: FAIL because `plan` and approved plan hash support do not exist.

- [ ] **Step 2: read-only plan command와 same-transaction hash recheck를 구현한다.**

```typescript
export type DataMigrationContext = {
  target: DataMigrationTarget;
  approvedPlanHash?: string;
};

export type DataMigration = {
  id: string;
  releaseVersion: string;
  name: string;
  phase?: 'pre-schema' | 'post-schema';
  requiresPlanApproval?: boolean;
  plan?: (
    tx: Prisma.TransactionClient,
    context: DataMigrationContext,
  ) => Promise<MigrationResult>;
  run: (
    tx: Prisma.TransactionClient,
    context: DataMigrationContext,
  ) => Promise<MigrationResult>;
};
```

`scripts/data-migrations/plan.ts`는 plan 결과와 승인 검사를 위한 testable orchestration surface를 소유한다.

```typescript
export interface PlannedDataMigration {
  migrationId: string;
  result: MigrationResult;
  planHash: string;
  requiresPlanApproval: boolean;
}

export function assertApprovedMigrationPlan(input: {
  plans: readonly PlannedDataMigration[];
  approvedPlanHash?: string;
}): void {
  const guardedPlans = input.plans.filter((plan) => plan.requiresPlanApproval);
  if (guardedPlans.length === 0) return;
  if (guardedPlans.length > 1) {
    throw new Error('exactly one pending migration may require plan approval');
  }
  if (!input.approvedPlanHash || guardedPlans[0].planHash !== input.approvedPlanHash) {
    throw new Error('approved data migration plan hash does not match');
  }
}
```

같은 파일은 key-sorted JSON과 SHA-256을 소유한다.

```typescript
import { createHash } from 'node:crypto';
import type { MigrationResult } from './types';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function migrationPlanHash(
  migrationId: string,
  result: MigrationResult,
): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize({ migrationId, result })))
    .digest('hex');
}
```

`npm run data:migrate -- plan`은 selected migration의 `plan()`을 `SET TRANSACTION READ ONLY`인 repeatable-read transaction에서 실행하고 `PlannedDataMigration[]` JSON report를 출력한다. `run-data-migrations.ts`의 기존 selected-migration loop를 유지하되, `up --approved-plan-hash`는 exactly one pending `requiresPlanApproval` migration만 허용한다. `runOneMigration`의 write transaction 안에서 `plan()`을 다시 실행해 `PlannedDataMigration`을 만들고 `assertApprovedMigrationPlan()`을 통과한 뒤에만 `run()`을 호출한다. 이 순서로 plan과 write 사이의 row drift도 hash mismatch로 차단한다.

- [ ] **Step 3: explicit allowlist reset plan/run을 구현한다.**

Migration metadata는 다음으로 고정한다.

```typescript
export const resetSourcingRuntimeState: DataMigration = {
  id: 'v0.1.30:005_reset_sourcing_runtime_state',
  releaseVersion: '0.1.30',
  name: 'Reset sourcing runtime state while preserving downstream provenance',
  phase: 'pre-schema',
  requiresPlanApproval: true,
  plan: buildSourcingResetPlan,
  run: resetSourcingRuntimeState,
};
```

Plan report는 다음 exact groups와 row counts를 출력한다.

```typescript
interface SourcingResetPlanDetails {
  purgeCounts: Record<string, number>;
  protectedCandidateCount: number;
  unprotectedCandidateCount: number;
  protectedImageCount: number;
  unexpectedForeignKeys: Array<{
    constraintName: string;
    sourceTable: string;
    targetTable: string;
  }>;
}
```

Allowlisted sourcing runtime tables:

```text
sourcing_workspace_snapshots
trend_seed_keywords
naver_keyword_daily_snapshots
naver_popular_keyword_daily_snapshots
sourcing_1688_hot_product_daily_snapshots
shorts_trend_daily_snapshots
live_commerce_broadcast_daily_snapshots
live_commerce_product_daily_snapshots
tiktok_creative_trend_daily_snapshots
sourcing_decision_evidence
sourcing_decision_batch_items
sourcing_decision_batches
sourcing_launch_candidates
sourcing_evidence_observations
sourcing_evidence_ingestion_runs
sourcing_source_entitlement_versions
```

새 normalized recommendation/validation/review/interest/offer-observation tables는 이 migration 다음 schema 단계에서 처음 생성되므로 pre-schema purge 대상에 넣지 않는다. reset plan은 현재 배포 schema에 실제 존재하는 위 allowlist만 다루고, bootstrap 전에 새 tables가 0행인지 별도 assertion한다.

Bounded Supply exception tables, deleted only as the sourcing-origin graph and before referenced evidence:

```text
procurement_test_intents
supplier_offer_price_tiers
supplier_offer_sku_snapshots
```

Never delete `suppliers`, `supplier_products`, `supplier_payments`, purchase order tables, product registration executions, Product/Channel/Order/Inventory/Finance/Ads rows.

Candidate protection query treats a candidate as protected when any of these is true: `provenance_master_product_id` is non-null; it is referenced by `content_generation_sources`, `content_generations`, `content_workspaces`, `product_preparations`, `thumbnail_generations`, `channel_listings`, `detail_page_image_render_intents`; or one of its images is referenced by `thumbnail_generation_input_images`. Protected candidates keep `status` unchanged and receive only `is_deleted = true`, `deleted_at = CURRENT_TIMESTAMP`. Their images remain. Unprotected images/candidates are deleted in FK order.

`pg_constraint` is queried before mutation. Any inbound FK to an allowlisted purge table that is not in the reviewed relationship set populates `unexpectedForeignKeys`, makes the plan non-executable, and makes `run()` throw. Delete/update uses Prisma tagged raw templates and explicit literal table statements, not interpolated table names.

- [ ] **Step 4: actual PG reset safety test를 작성하고 pass시킨다.**

The isolated Testcontainers fixture creates one unprotected candidate and one `ProductPreparation`-referenced candidate whose image is also referenced by `ThumbnailGenerationInputImage`, plus runtime trend/evidence/decision rows and a Supply offer/intent graph. It executes plan then run with the exact hash.

```typescript
expect(plan.details).toMatchObject({
  protectedCandidateCount: 1,
  unprotectedCandidateCount: 1,
  unexpectedForeignKeys: [],
});
expect(await prisma.sourcingCandidate.findUnique({
  where: { id: protectedCandidateId },
  select: { status: true, isDeleted: true, deletedAt: true },
})).toMatchObject({ status: 'sourced', isDeleted: true });
expect(await prisma.sourcingCandidate.findUnique({
  where: { id: unprotectedCandidateId },
})).toBeNull();
expect(await prisma.productPreparation.findUnique({
  where: { id: productPreparationId },
})).not.toBeNull();
```

Run: `rtk npm run test:integration --workspace=apps/server -- src/sourcing/__tests__/sourcing-reset.pg.integration.spec.ts`

Expected: reset counts match, protected status/FKs remain, unprotected runtime state is gone, an injected unknown FK makes execute fail.

- [ ] **Step 5: reviewed source manifest, cutover mode, bootstrap, and retention operations를 구현한다.**

Protected environment provides `SOURCING_SOURCE_MANIFEST_JSON`; no source legal claim or reviewer ID is hard-coded. Its schema is strict and requires sourceKey, scopeKey, lifecycle=`qualified`, decisionImpact=`enabled`, ownerLabel, legalBasis, allowedMethod, permittedFields, prohibitedUses, rate limit, retention days, max staleness, coverage and revision policy for each source. It also contains bounded default interest targets. Missing/invalid manifest makes initialization unavailable and collection fail closed.

```typescript
import { z } from 'zod';

export const SourcingSourceManifestSchema = z.object({
  schemaVersion: z.literal('1'),
  sources: z.array(z.object({
    sourceKey: z.enum([
      'naver.datalab_keyword',
      'naver.datalab_popular',
      'naver.search_ad_keyword',
      'naver.autocomplete_keyword',
      '1688.hot_product',
      '1688.catalog_search',
      'shortstrend.video_trend',
      'tiktok.creative_center',
      'taobao.live_commerce',
      'google.trends_rss',
      'linkfox.echotik_shadow',
      'coupang.wing_extension',
      '1688.product_extension',
      'alibaba.product_extension',
    ]),
    scopeKey: z.string().min(1).max(160),
    lifecycle: z.literal('qualified'),
    decisionImpact: z.literal('enabled'),
    ownerLabel: z.string().min(1).max(160),
    legalBasis: z.string().min(1).max(2_000),
    allowedMethod: z.string().min(1).max(2_000),
    credentialRef: z.string().max(300).nullable(),
    permittedFields: z.array(z.string().min(1).max(120)).min(1),
    prohibitedUses: z.array(z.string().min(1).max(300)),
    rateLimitValue: z.number().int().positive(),
    rateLimitWindowSeconds: z.number().int().positive(),
    coverageDefinition: z.string().min(1).max(2_000),
    denominatorDefinition: z.string().min(1).max(2_000),
    maxStalenessMinutes: z.number().int().positive(),
    minimumCoverageBps: z.number().int().min(0).max(10_000),
    revisionPolicy: z.string().min(1).max(2_000),
    retentionDays: z.number().int().positive(),
    permissionStartsAt: z.string().datetime({ offset: true }),
    permissionExpiresAt: z.string().datetime({ offset: true }),
  }).strict()).min(1),
  defaultInterestTargets: z.array(z.object({
    displayKeyword: z.string().min(1).max(200),
    keywordCn: z.string().min(1).max(200).nullable(),
    sourceKeys: z.array(z.string().min(1).max(80)).min(1),
  }).strict()).max(100),
}).strict().superRefine((manifest, context) => {
  const sourceKeys = new Set<string>();
  const sourceScopes = new Set<string>();
  for (const source of manifest.sources) {
    sourceKeys.add(source.sourceKey);
    const identity = `${source.sourceKey}\u001f${source.scopeKey}`;
    if (sourceScopes.has(identity)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['sources'],
        message: `duplicate source/scope: ${source.sourceKey}/${source.scopeKey}`,
      });
    }
    sourceScopes.add(identity);
  }
  for (const [targetIndex, target] of manifest.defaultInterestTargets.entries()) {
    for (const sourceKey of target.sourceKeys) {
      if (!sourceKeys.has(sourceKey)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['defaultInterestTargets', targetIndex, 'sourceKeys'],
          message: `unknown source key: ${sourceKey}`,
        });
      }
    }
  }
});
```

Endpoints:

```text
GET  /api/sourcing/control/status
POST /api/sourcing/control/initialize
```

Initialize is `@Roles('owner', 'admin')`, accepts only a `manifestHash` field matching `/^[a-f0-9]{64}$/`, loads/validates the protected manifest, compares its canonical hash, and uses `@CurrentUser().id` as `reviewedByUserId`. It idempotently creates fresh entitlement versions, interest targets, then starts `sourcing.bootstrap_workspace` through Operations. No system/placeholder reviewer is allowed.

`SOURCING_CUTOVER_MODE` is `closed | canary | open`; missing or invalid input resolves to `closed` with a startup warning. Closed allows control status/initialize and read envelopes only; canary allows writes only for authenticated IDs in `SOURCING_CUTOVER_REVIEWER_USER_IDS`; an empty reviewer list allows no canary writes; open allows normal writes. The coordinator and interest/review commands enforce this server-side.

Bootstrap stages are interest check, bounded source collection, evidence/typed commit, rising/recommendation, validation preparation, projection/RAG, 14-screen coverage check. Stage keys are idempotent; a retry skips completed input hashes and retries failed sources only.

Retention operation deletes at most 500 unreferenced observations per transaction using `(ingestedAt, id)` cursor and entitlement retention days. Evidence referenced by recommendation/validation/review/decision/Supply rows is excluded. Projection expiry uses the same bounded operation. Register the operation disabled by default until Office source manifests are reviewed.

- [ ] **Step 6: legacy models and dead backend ownership paths를 제거한다.**

After reset PG tests and all new callers pass:

- remove Prisma models `TrendSeedKeyword` and `Sourcing1688HotProductDailySnapshot` plus Organization reverse fields; the normalized interest/offer observation tables replace them;
- remove client-facing PUT and public controller ownership from `sourcing-workspace-snapshot.controller.ts`; keep only internal projection repository/service if still used;
- remove unused POST `/sourcing/rising-products/latest`, POST `/sourcing/market-model/latest`, POST `/sourcing/1688-new-product-model/latest`, RAG rebuild public endpoint, and direct duplicate POST `/sourcing/trend/collect` after consumer scans show none;
- retain canonical intelligence source/launch/decision APIs and Supply APIs because they are valid domain surfaces even though the 14-screen path does not call them;
- do not remove the Python agent runtime in this PR.

Add route/consumer scans to architecture tests so removed APIs cannot silently reappear without an owner.

```bash
rtk rg -n "sourcing-workspace-snapshot|trend/collect|rising-products/latest|market-model/latest|1688-new-product-model/latest|agent-rag/rebuild" apps/web/src apps/server/src/sourcing
rtk npx prisma validate
```

Expected: the first command finds only the internal projection repository and explicit architecture assertions; Prisma validation passes with no removed legacy model reference.

- [ ] **Step 7: performance, full verification, docs, and cutover rehearsal을 complete한다.**

`sourcing-performance.pg.integration.spec.ts` seeds 10,000 offer observations, 5,000 recommendation items, and 1,000 selections. It runs 50 warmed latest/cursor reads and 50 command-acceptance transactions, sorts durations, and asserts p95 read at or below 300 ms and p95 command acceptance at or below 500 ms. Provider time is not included. It also asserts the relevant `EXPLAIN (FORMAT JSON)` plans use organization-leading indexes and do not sequential-scan the large fact tables.

Cutover runbook exact order:

```text
maintenance/ingress close
Office DB backup and restore checkpoint verification
candidate SHA: capture data:migrate plan --phase pre-schema --release-version 0.1.30 --target office JSON
operator reviews counts/FKs and retypes the exact 64-character planHash into $approvedPlanHash
candidate SHA: data:migrate up --phase pre-schema --release-version 0.1.30 --target office --confirm APPLY_DATA_MIGRATIONS --approved-plan-hash $approvedPlanHash
immutable candidate deploy with -ApplySchema -AcceptDataLoss and SOURCING_CUTOVER_MODE=closed
owner/admin POST /api/sourcing/control/initialize with reviewed manifest hash
wait for bootstrap terminal success and coverage report
restart as canary; reviewer checks all 14 routes
restart as open; verify metrics and resume ingress
```

The committed PowerShell runbook validates `$approvedPlanHash -match '^[a-f0-9]{64}$'` before invoking `up`; it never commits an environment-specific hash.

Run full gates:

```bash
rtk npm exec --workspace=packages/shared vitest -- run src/sourcing
rtk npm run build --workspace=packages/shared
rtk npm exec --workspace=apps/server vitest -- run src/sourcing src/supply/adapter/out/repository/__tests__/supply-sourcing-procurement.repository.adapter.spec.ts src/operations
rtk npm run test:integration --workspace=apps/server -- src/sourcing
rtk node --test extensions/tests/product-scraper/*.test.mjs extensions/tests/kiditem-os-service-worker-boot.test.mjs
rtk npm exec --workspace=apps/web vitest -- run 'src/app/(sourcing-ai)/sourcing-ai'
rtk npm run test:scripts
rtk npm run check:conventions
rtk npm run db:push
rtk npx prisma generate
rtk npm run build --workspace=apps/web
rtk npm run build --workspace=apps/server
```

Expected: every command PASS. `db:push` runs only against the reviewed local development DB after the reset dry-run; it must report only the approved sourcing table/constraint removals and additions.

Boot gate:

```bash
rtk npm run dev:server
```

Expected: Nest prints a successful application start with sourcing/operations/supply modules wired. Stop it with Ctrl-C after confirming boot.

Stage and commit the final task:

```bash
rtk git add scripts prisma/models apps/server/src/sourcing docs/runbooks docs/ARCHITECTURE.md
rtk git diff --cached --check
rtk git commit -m "chore: add guarded sourcing cutover"
```

PR/release gates now inspect the complete seven-commit branch:

```bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
rtk git diff --check
rtk git status --short
```

Expected: both PR guards and diff checks PASS and the worktree is clean. If a guard requires a correction, make the correction, rerun its focused test, and amend only this private final commit before opening the PR.

## Final Acceptance Checklist

- [ ] All 14 sidebar routes and major controls remain present; enabled controls have a real command.
- [ ] Missing/expired/killed entitlement produces provider call count 0 and persisted source-fact count 0.
- [ ] Entitlement version/expiry change during IO produces commit count 0.
- [ ] v1/v2 Extension fixtures preserve price, MOQ, supplier, SKU attributes/items, and price tiers.
- [ ] Same offer across keywords preserves each keyword/rank provenance and one stable item identity per offer/variant/match.
- [ ] Concurrent collection, interest, selection, decision, and Supply idempotency tests pass on real PostgreSQL.
- [ ] Browser localStorage/workspace JSON no longer owns recommendations, exclusions, interests, offers, or selections.
- [ ] Home/Today/Entry/Final read the same eligible recommendation run and only server code assigns score/grade/action.
- [ ] Rising POST and GET serialize identical confidence, coverage, and data gaps.
- [ ] RAG cache identity changes with days, cutoff, or input manifest.
- [ ] Validation has no fixture 91/28.5 fallback and incomplete economics remain null.
- [ ] Final CTA returns a review batch ID and creates no decision, intent, PO, or provider call.
- [ ] Reset plan reports no unknown FK, protected candidate status remains unchanged, and downstream rows survive.
- [ ] Reviewed manifest initialization and bootstrap are idempotent; failed source retry does not repeat completed sources.
- [ ] Cached screen p95 is at most 300 ms and command acceptance p95 is at most 500 ms in the recorded PG benchmark.
- [ ] Office runbook performs backup, pre-schema plan/hash/reset, schema deploy, reviewed seed, bootstrap, 14-screen canary, then ingress open.

## Rollback Boundary

- Before reset: abort deployment and reopen old ingress; no DB mutation occurred.
- After reset but before schema/bootstrap: keep sourcing ingress closed and restore the verified Office DB checkpoint if rollback is chosen.
- After schema/bootstrap: runtime rollback alone is insufficient because old tables were removed. Keep ingress closed and restore DB checkpoint plus prior immutable runtime together.
- Never use browser cache or old workspace payload as rollback data.
- Never mutate or delete downstream Product/Channel/Order/Inventory/Finance/Ads rows during rollback.
