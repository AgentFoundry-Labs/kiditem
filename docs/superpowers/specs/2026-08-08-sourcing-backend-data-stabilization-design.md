# Sourcing Backend and Data Stabilization Design

- Date: 2026-08-08
- Status: Direction approved; written-spec review pending; implementation plan not yet written
- Classification: sourcing-domain reconstruction with bounded Operations, Supply, Ads, Extension, and downstream-product boundary work
- Scope: `/sourcing-ai` 사이드바의 14개 화면과 그 화면이 사용하는 NestJS, Operations, Chrome Extension, sourcing-owned persistence
- Compatibility: 화면의 정보 구조와 사용자 기능은 유지한다. Web API는 같은 릴리스 안에서 변경할 수 있고, 배포된 Chrome Extension v1 wire contract는 호환한다.
- Data policy: 기존 sourcing-owned 데이터는 보존하거나 backfill하지 않는다. 다만 Product, Channel, Order 등 후속 도메인이 참조하는 provenance 행은 물리 삭제하지 않는다.
- Companion documents:
  - `docs/superpowers/specs/2026-08-01-sourcing-intelligence-v2-1-executable-architecture-design.md`
  - `docs/superpowers/specs/2026-07-31-sourcing-agent-learning-architecture-design.md`

## 0. 결정 요약

소싱 섹터는 다음 구조로 재구축한다.

```text
기존 14개 화면
    │
    v
Web API / Extension v1 compatibility facade
    │
    ├── command services ──> collection coordinator ──> authorized observations
    │
    └── read-model services <── immutable recommendation/validation runs
                                  │
                                  v
                       normalized durable data
                                  │
                                  v
                       disposable projection cache
```

핵심 결정은 다음과 같다.

1. 수집 권한은 evidence 적재 뒤의 부가 검사가 아니라 외부 호출과 저장의 선행조건이다.
2. 브라우저와 `SourcingWorkspaceSnapshot.payload`는 canonical state를 소유하지 않는다.
3. 관심 키워드, 1688 offer 관찰, 추천 실행, 검증 실행, 검토 선택을 정규화한다.
4. 추천 점수와 상태는 서버의 versioned model만 계산한다.
5. 동시 쓰기는 keyed command, DB uniqueness, lease, compare-and-set으로 해결한다.
6. 기존 sourcing 데이터는 새 구조로 옮기지 않고 명시적 allowlist reset 후 자동 bootstrap한다.
7. downstream 참조가 있는 `SourcingCandidate`는 삭제하지 않고 archived provenance로 남긴다.
8. canonical 발주 경로는 이번 단계에서 열지 않는다. 최종 선택은 immutable review batch까지만 만든다.
9. 네 개의 순차 PR을 모두 합친 뒤 Office를 한 번에 전환한다. 운영 dual-read/dual-write 기간은 두지 않는다.

## 1. 목표와 비목표

### 1.1 목표

- 현재 소싱 사이드바의 화면, 탭, 버튼, 진행 상태, 결과 표현을 유지한다.
- source entitlement, expiry, kill switch가 모든 신규 외부 수집과 extension 결과 수용을 실제로 차단하게 한다.
- 자동 수집, 수동 수집, scheduler, extension 결과가 하나의 실행·증거 계약을 사용하게 한다.
- 병렬 탭, 재시도, 새로고침, 늦게 도착한 응답에서도 데이터가 유실되거나 되돌아가지 않게 한다.
- 같은 offer와 variant가 화면마다 같은 stable identity를 갖게 한다.
- 추천, 급상승, 검증, RAG 답변이 정확한 입력 cutoff와 model version을 설명할 수 있게 한다.
- query 대상 데이터를 typed column으로 정규화하고 JSON은 원본 envelope 또는 재생성 가능한 projection에만 사용한다.
- 조직 격리, cursor pagination, batch write, retention으로 DB 비용과 지연을 제한한다.
- 실제 PostgreSQL 동시성·constraint 동작과 실제 extension payload를 테스트한다.

### 1.2 비목표

- 화면 재디자인 또는 메뉴 재구성
- 자동 PO 생성, provider 주문, 결제, 입고 실행
- 기존 sourcing 추천·트렌드·선택·검증 데이터의 backfill
- 기존 heuristic 결과를 학습 데이터로 승격
- 온라인 RL, contextual bandit, 자동 model promotion
- Product, Channel, Order, Inventory, Finance 데이터의 재구축
- 현재 Ads-owned 경쟁업체/상품 추적 데이터를 Sourcing DB로 이동

### 1.3 사용자 경험 불변조건

- 사용자는 기존 14개 메뉴와 주요 CTA를 같은 위치에서 사용할 수 있다.
- 수집 요청은 즉시 operation/run ID를 반환하고 화면은 진행·성공·부분 실패·실패·취소를 구분한다.
- 데이터가 없을 때와 오류가 발생했을 때를 같은 빈 상태로 표시하지 않는다.
- stale 데이터는 마지막 성공 시각과 stale 이유를 함께 보여준다.
- 상품 검증은 더 이상 fixture 점수나 가짜 마진을 보여주지 않는다.
- 최종 선택의 handoff CTA는 실제 review batch ID를 반환하지만 발주를 만들지는 않는다.

### 1.4 현재 데이터 전제

감사 시점의 현재 checkout이 가리키는 local PostgreSQL에는 `SourcingCandidate` 3행과 `CandidateImage` 13행이 있었고, workspace/trend/entitlement/evidence/launch/decision/offer/intent 행은 없었다. 이는 Office DB가 비어 있다는 증거는 아니다. 이 설계의 reset 정책은 환경별 row count가 아니라 “기존 sourcing-owned 데이터는 보존할 필요가 없다”는 운영 결정에 근거한다. 따라서 Office에서는 dry run으로 실제 참조를 다시 분류하되 sourcing 데이터를 backfill하지 않는다.

## 2. 현재 문제와 설계 원칙

### 2.1 해결해야 하는 구조적 문제

- trend collector가 provider 호출과 snapshot 저장을 끝낸 뒤 entitlement/evidence를 best-effort로 처리한다.
- extension ingest가 entitlement와 evidence 경계를 우회한다.
- `SourcingWorkspaceSnapshot`이 조직·scope·날짜당 JSON 한 행이라 여러 writer가 GET→merge→PUT할 때 last-write-wins가 발생한다.
- 1688 동일성, dedupe, React row ID가 offer ID, URL, title, array index를 서로 다르게 사용한다.
- 브라우저 global `localStorage`가 다른 조직의 추천·선택을 우선 로드할 수 있다.
- client scorer와 server scorer가 같은 의미를 독립 계산하고 높은 점수를 승자로 선택한다.
- 현재 의사결정 센터 route는 canonical launch/decision/intent workspace와 연결되지 않는다.
- 상품 검증은 운영 화면처럼 보이지만 fixture다.
- 최종 선택 handoff는 no-op이다.
- same-transaction `P2002` recovery, captured-at 무시 upsert, 불완전 retry equivalence가 실제 PostgreSQL에서 안전하지 않다.
- extension extractor의 snake_case payload와 DTO whitelist가 달라 가격·공급사·variant evidence가 조용히 제거된다.
- assistant CLI의 `--allowed-tools ""`는 filesystem tool 제거를 보장하지 않는다.
- extension이 page-world URL을 검증 없이 fetch하면 private/local address 요청 경로가 생긴다.

### 2.2 적용 원칙

1. **권한 먼저**: 외부 IO 전에 fail closed한다.
2. **관찰과 판단 분리**: source fact, recommendation, validation, review selection은 별도 수명주기를 가진다.
3. **서버 단일 소유권**: score, freshness, identity, selection mutation은 서버가 소유한다.
4. **immutable run**: 추천과 검증은 입력 cutoff와 version을 고정한 실행 단위로 남긴다.
5. **projection은 폐기 가능**: projection 삭제 후 canonical row에서 다시 만들 수 있어야 한다.
6. **조직 경계 내장**: 모든 mutable command와 단일-resource read는 `organizationId`를 서버 context에서 받는다.
7. **DB clock과 constraint 신뢰**: 권한 시각, lease, 최신성, uniqueness는 application clock이나 in-memory lock에만 맡기지 않는다.
8. **실패를 데이터로 위장하지 않음**: unavailable/error는 빈 배열과 구분한다.
9. **하류 도메인 보호**: reconstruction은 Product/Channel/Order provenance 삭제 권한이 아니다.

## 3. 검토한 접근과 선택 이유

### 3.1 선택: compatibility facade + normalized durable data + rebuildable projections

기존 화면은 screen-specific read model과 command facade를 소비한다. 내부에서는 typed durable row와 immutable run을 사용하고, 화면 조합용 JSON은 서버가 생성하는 cache로만 둔다.

장점:

- 화면을 유지하면서 backend와 DB를 단계적으로 분리할 수 있다.
- PR #468의 evidence/decision foundation을 필요한 지점에 재사용하되 모든 탐색 화면을 premature canonical decision으로 만들지 않는다.
- 브라우저 cache와 whole-document write를 제거할 수 있다.
- source fact와 presentation model을 독립적으로 최적화할 수 있다.

### 3.2 기각: 모든 화면을 PR #468 canonical ledger로 직접 연결

초기 탐색, 키워드 분석, 도매 검색까지 `LaunchCandidate`와 `SourcingDecisionBatch`를 요구하면 아직 exact variant와 economics가 없는 lead가 canonical decision처럼 저장된다. ingestion volume과 decision audit volume도 불필요하게 결합된다.

### 3.3 기각: 기존 JSON snapshot만 version/CAS로 보강

CAS는 lost update 일부는 줄이지만 query, identity, 조직 간 browser cache, client/server scorer divergence, validation fixture, provenance 문제를 해결하지 못한다. 단기 patch로는 가능하지만 이번 재구축의 목표에는 부족하다.

## 4. 대상 아키텍처와 소유권

### 4.1 계층

```text
Web pages / Chrome Extension
          │
          v
HTTP adapters
  - Web read-model endpoints
  - Web command endpoints
  - Extension v1 translator
  - Extension v2 schema
          │
          v
Application services
  - SourcingCollectionCoordinator
  - SourcingInterestService
  - SourcingRecommendationService
  - SourcingValidationService
  - SourcingReviewService
          │
          ├── Operations: top-level operation envelope and cancellation
          ├── Sourcing: entitlement, evidence, recommendation, validation, review
          ├── Supply: immutable supplier offer and future procurement intent
          └── Ads: competitor/product tracking read boundary
          │
          v
Prisma repository adapters / PostgreSQL
```

HTTP adapter는 DTO translation과 authentication만 한다. scorer, merge, dedupe, fallback business rule을 controller나 React component에 두지 않는다.

### 4.2 데이터 등급

| 등급 | 데이터 | 성질 | 삭제/재생성 |
|---|---|---|---|
| Source contract | `SourcingSourceEntitlementVersion` | reviewed, versioned | 명시적 retire만 허용 |
| Source fact | ingestion run, evidence observation, typed trend/offer observation | append-only 또는 freshness-guarded | retention 조건 내에서만 purge |
| Supply fact | `SupplierOfferSkuSnapshot`, tiers | immutable | Supply 경계와 참조 검사 필요 |
| Derived run | recommendation, rising, validation | immutable versioned output | source fact로 새 run 생성 가능 |
| Human state | interest, review selection, review batch | keyed mutation 또는 immutable batch | 사용자 command로만 변경 |
| Canonical decision | launch candidate, decision batch, procurement intent | immutable audit | 이번 화면 cutover에서 자동 생성 금지 |
| Projection | workspace/home/RAG presentation cache | server-generated JSON | 언제든 삭제·재생성 가능 |
| Browser cache | org-scoped display hint | 비권위적 | logout/org switch/version bump 시 폐기 |

### 4.3 경계별 source of truth

- Sourcing은 source permission, collection run, observations, recommendations, validations, review selection을 소유한다.
- Supply는 supplier offer commercial snapshot과 procurement intent를 소유한다.
- Operations는 화면에 노출되는 장시간 operation lifecycle을 소유한다.
- Ads는 competitor, Wing tracked product, rank history를 계속 소유한다.
- Product/Channel/Order는 이미 승격된 상품과 판매·주문 데이터를 계속 소유한다.
- `SourcingWorkspaceSnapshot`과 browser storage는 어떤 domain state도 소유하지 않는다.

## 5. DB 스키마 설계

### 5.1 기존 테이블의 역할 수정

#### `SourcingWorkspaceSnapshot`

서버 전용 projection cache로 제한한다.

- client-facing PUT endpoint를 제거한다.
- `projectionVersion`, `inputHash`, `generatedAt`, `expiresAt`을 저장한다.
- cache identity는 최소 `organizationId + scope + businessDate + projectionVersion + inputHash`를 반영한다.
- payload는 화면 표시를 위한 one-off JSON만 담고 query/aggregate source로 사용하지 않는다.
- RAG와 model execution은 workspace payload가 아니라 canonical typed rows/run IDs를 입력으로 사용한다.

#### typed daily source snapshots

Naver, popular keyword, Shorts/TikTok, 1688 typed table은 query-efficient source fact로 유지할 수 있다. 모든 writer는 coordinator를 통과한다.

- upsert update에는 `incoming.capturedAt > stored.capturedAt` 조건을 둔다.
- 같거나 오래된 응답은 `stale_discarded`로 집계하고 기존 행을 덮지 않는다.
- 1688 hot identity에 `sourceKeyword`와 normalized `variantKey`를 포함한다.
- nullable identity column은 uniqueness에 직접 쓰지 않고 canonical empty sentinel 또는 별도 non-null normalized key를 사용한다.
- source raw JSON은 evidence observation에 보존하고 typed table에는 조회·정렬에 필요한 열만 둔다.

#### `SourcingEvidenceIngestionRun`

collection permit과 실행 기록의 단일 persistence owner로 확장한다.

- exact `sourceKey`, `scopeKey`를 entitlement relation과 함께 run에 고정한다.
- `leaseToken`, `leaseExpiresAt`, `authorizationCheckedAt`, `entitlementVersionHash`, `generation`을 추가한다.
- active 상태는 `queued | running | commit_pending | cancel_requested`로 제한한다.
- `organizationId + sourceKey/scope + targetKey`당 active run 하나를 partial unique constraint로 보장한다.
- terminal 상태는 `succeeded | partially_succeeded | failed | cancelled | superseded`다.
- 동일 idempotency key의 request hash가 다르면 `409 IDEMPOTENCY_CONFLICT`다.

#### `SourcingEvidenceObservation`

재시도 동일성은 payload만 비교하지 않고 전체 immutable envelope를 비교한다.

`envelopeHash`는 다음 필드를 canonical serialization한 SHA-256이다.

- source/platform/evidence family/signal role/decision impact
- source entity type/key, observation type, schema version
- concept key, candidate support flag, source URL
- event/observed/available/captured timestamps
- revision/supersedes identity
- canonical payload hash

같은 `observationKey + revision` 재시도는 `envelopeHash`까지 같을 때만 duplicate 성공이다. 다르면 `409 EVIDENCE_RETRY_CONFLICT`로 실패한다. unique 충돌 뒤 같은 PostgreSQL transaction을 재사용하지 않고 transaction 밖에서 winner를 읽거나 `INSERT ... ON CONFLICT` 단일 statement를 사용한다.

### 5.2 새 normalized models

#### `SourcingInterestTarget`

관심 키워드와 source scope를 atomic하게 관리한다.

주요 열:

- `id`, `organizationId`
- `normalizedKeyword`, `displayKeyword`
- `sourceKeys[]`, `enabled`
- `createdByUserId`, `createdAt`, `updatedAt`
- optimistic `version`

제약:

- unique `(organizationId, normalizedKeyword)`
- add는 idempotent upsert, remove는 `{id, organizationId, version}` compare-and-set
- 전체 document replace 금지

#### `Sourcing1688OfferKeywordObservation`

키워드별 1688 offer/variant 관찰을 query 가능한 typed row로 저장한다.

주요 열:

- `organizationId`, `evidenceObservationId`, `ingestionRunId`
- `businessDate`, `sourceKeywordNormalized`
- `externalOfferId`, `variantKeyNormalized`
- rank, title, price range, MOQ, sales, repurchase rate
- supplier identity/name, image/source URL
- `capturedAt`, `schemaVersion`

제약:

- unique `evidenceObservationId`
- unique `(organizationId, businessDate, sourceKeywordNormalized, externalOfferId, variantKeyNormalized, capturedAt)`
- index `(organizationId, sourceKeywordNormalized, capturedAt desc)`
- index `(organizationId, externalOfferId, variantKeyNormalized, capturedAt desc)`

offer가 여러 키워드에 등장하면 observation을 합치지 않는다. offer identity는 같아도 keyword provenance와 rank는 별도 fact다.

#### `SourcingRecommendationRun` / `SourcingRecommendationItem`

Home, 오늘의 추천, Entry, Final이 공유하는 immutable 추천 실행이다.

Run 주요 열:

- `organizationId`, `businessDate`, `status`
- `policyKey`, `policyVersion`, `modelVersion`, `calculationVersion`
- `inputCutoffAt`, `inputManifestHash`
- `coverage`, `confidence`, `dataGaps`
- `startedAt`, `completedAt`, `expiresAt`

Item 주요 열:

- stable `itemKey`
- `externalOfferId`, `variantKeyNormalized`, `matchedCoupangProductId`
- rank, score, grade, baseline action
- component scores, reason/risk codes
- exact input observation references

제약:

- run은 immutable terminal output이다.
- item unique `(recommendationRunId, itemKey)`
- 최신 조회 index `(organizationId, status, completedAt desc)`
- stable item key는 `sourcePlatform + offerId + variantKey + matchedCoupangProductId`의 canonical hash다. array index와 tracking URL은 identity가 아니다.
- offer ID를 trusted field 또는 validated URL에서 얻지 못한 row는 추천 item으로 승격하지 않고 ingest rejection/quarantine으로 남긴다.

#### `SourcingValidationEpisode` / `SourcingValidationCheck`

fixture를 실제 검증 lifecycle로 교체한다.

Episode 주요 열:

- `organizationId`, `itemKey`, source recommendation run/item
- `status`, `policyVersion`, `inputCutoffAt`
- `startedAt`, `observeUntil`, `completedAt`
- expected margin/landed-cost result는 입력이 완전할 때만 nullable typed column에 저장

Check 주요 열:

- check key, status, severity
- input observation IDs
- measured value/unit, threshold/rule version
- reason code, checkedAt, expiresAt

상태는 `pending -> observing -> ready_for_review | blocked | failed`다. 부분 입력으로 숫자를 만들지 않는다.

#### `SourcingReviewSelection`

Entry와 Final의 선택/제외 상태를 조직별로 보존한다.

- key: `(organizationId, workspaceKey, itemKey)`
- state: `selected | removed | neutral`
- `recommendationRunId`, `version`, actor, timestamps
- mutation은 compare-and-set 또는 atomic upsert
- 새 추천 run에 존재하지 않는 이전 item은 UI에 자동 승격하지 않는다.

#### `SourcingReviewBatch` / `SourcingReviewBatchItem`

최종 선택 CTA의 안전한 실제 결과다.

- 선택한 recommendation item, validation episode, offer/variant version을 immutable하게 고정한다.
- status는 이번 범위에서 `awaiting_procurement_enablement | cancelled`만 사용한다.
- 생성 응답은 batch ID와 고정된 item 수를 반환한다.
- `ProcurementTestIntent`, PO, provider call을 생성하지 않는다.
- 향후 procurement 기능은 별도 승인된 설계에서 이 batch를 입력으로 사용한다.

### 5.3 JSON 사용 규칙

JSON 허용:

- 원본 provider payload
- immutable model output의 설명용 세부 정보
- 재생성 가능한 화면 projection

JSON 금지:

- 조직별 관심 키워드 목록
- 선택/제외 상태
- offer/variant identity와 가격/MOQ
- query/filter/sort 대상 점수와 상태
- idempotency, version, expiry, permission

### 5.4 참조와 인덱스

- cross-domain FK는 가능한 경우 `(id, organizationId)` composite reference를 사용한다.
- mutable/read endpoint는 항상 organization leading index를 사용한다.
- 최신 목록은 `(organizationId, status, capturedAt/completedAt desc, id)` cursor index를 사용한다.
- offset pagination은 운영 화면의 작은 고정 fixture 외에는 사용하지 않는다.
- evidence ingest는 행당 transaction/query가 아니라 validation 후 batch insert/upsert를 사용한다.
- decision/review가 참조하는 observation은 retention purge 대상에서 제외한다.
- 초기에는 table partition을 도입하지 않는다. 실제 volume과 purge latency가 기준치를 넘을 때 organization/date access pattern을 근거로 별도 schema change를 검토한다.

## 6. 수집 control plane

### 6.1 단일 coordinator

다음 ingress는 모두 `SourcingCollectionCoordinator`를 호출한다.

- Web 수동 수집
- 페이지 mount/자동 bootstrap 수집
- Operations scheduler
- Chrome Extension 결과 수용
- 내부 refresh/retry

화면별 service가 provider를 직접 호출하거나 snapshot을 직접 저장하지 않는다.

### 6.2 실행 순서

```text
1. organization/user/source/target 정규화
2. DB clock 기준 current entitlement + kill switch 검사
3. idempotency hash 검사와 active-run lease 획득
4. exact entitlement version을 permit에 고정
5. transaction 밖에서 bounded external IO
6. payload schema/identity/URL/freshness 검증
7. 짧은 transaction에서 entitlement version/expiry/kill switch 재검사
8. evidence envelope + typed observations atomic commit
9. run terminal 상태와 projection invalidation 기록
10. 필요하면 recommendation/validation 후속 operation enqueue
```

외부 IO를 DB transaction 안에서 수행하지 않는다. 첫 검사는 불필요한 호출을 막고, 두 번째 검사는 대기 중 만료·kill-switch·version 교체된 결과의 저장을 막는다.

### 6.3 동시성·멱등성

- active identity는 `organization + source scope + target`이다.
- 같은 request와 idempotency key는 기존 run을 반환한다.
- 같은 key의 다른 request는 409로 거절한다.
- completed run의 명시적 재수집은 새 revision/run ID를 만든다.
- lease 만료 reclaim은 generation을 증가시키며, 이전 generation의 늦은 commit은 `superseded` 처리한다.
- cancellation은 `cancel_requested`를 기록하고 provider call 경계와 commit 직전에 확인한다.
- 새로고침이나 재진입으로 component state가 사라져도 server active run을 재사용한다.
- bulk operation은 전체 성공, 부분 성공, 전체 실패를 정확히 구분한다.

### 6.4 최신성

- incoming `capturedAt`이 더 새로울 때만 mutable latest projection을 교체한다.
- provider의 event/observed/available/captured 시각을 구분한다.
- application 시작 시각을 entitlement/offer expiry 판단 시각으로 재사용하지 않는다.
- recommendation input cutoff 뒤에 도착한 evidence는 해당 run에 섞지 않고 다음 run 입력이 된다.

### 6.5 provider 부하 제어

- source entitlement의 rate limit을 per-organization semaphore와 global provider semaphore에 반영한다.
- 도매 자동 검색은 브라우저가 최대 20~30개 HTTP 요청을 직접 순차 실행하지 않고 한 server operation을 시작한다.
- coordinator가 missing target을 우선하고, bounded concurrency와 exponential backoff를 사용한다.
- retry 가능한 transport/rate-limit 실패와 validation/permission 영구 실패를 구분한다.

## 7. Web API와 Extension 호환

### 7.1 Web

Web과 server는 같은 릴리스에서 함께 배포하므로 기존 snapshot PUT과 client merge API는 유지하지 않는다. 화면 코드는 다음 종류의 API로 교체한다.

- collection start/status/cancel
- screen-specific read model
- interest keyed create/update/delete
- validation start/latest
- review selection atomic mutation
- review batch create/read

서버 응답의 공통 envelope:

```text
status: ready | collecting | stale | unavailable
generatedAt
lastSuccessfulAt?
freshUntil?
operationId?
data
warnings[]
error? { code, retryable, message }
```

`unavailable`과 transport/server error를 `data: []`로 변환하지 않는다.

### 7.2 Extension v1

배포된 extension의 현재 endpoint와 snake_case payload는 compatibility adapter가 계속 받는다.

- adapter는 `price_min`, `price_max`, `moq`, `supplier_name`, `specs`, `sku_attrs`, `sku_list`, `price_tiers`를 shared canonical DTO로 명시 변환한다.
- global `ValidationPipe`를 통과한 실제 extractor fixture로 계약 테스트한다.
- 알 수 없는 field는 관측 metric에 남기고 critical commercial field 누락은 성공으로 삼키지 않는다.
- v1 payload도 유효한 collection session/permit에만 commit한다.
- v1에 session ID가 없으면 인증된 `organizationId + userId + source + normalized target`에 대해 미리 열린 유일한 short-lived session과 server-side로 매칭한다. 매칭할 수 없거나 둘 이상이면 payload wire 형식은 이해하더라도 저장하지 않는다.

### 7.3 Extension v2

v2는 shared schema를 사용하고 다음을 명시한다.

- schema version
- server-issued collection session ID
- source platform, offer ID, variant IDs
- capturedAt과 extractor version
- normalized price/MOQ/supplier/variant fields
- raw payload hash

v1 지원 종료는 extension 배포율과 server 관측치를 근거로 별도 결정한다. 이번 전환에서 v1을 제거하지 않는다.

### 7.4 URL 및 요청 경계

- `https`와 허용된 Alibaba/1688 host만 수용한다.
- userinfo, non-default protocol, localhost, loopback, private, link-local, metadata address를 거절한다.
- redirect 매 hop을 재검증한다.
- page-world `_detail_url`을 그대로 fetch target으로 신뢰하지 않는다.
- offer ID는 validated URL/path 또는 trusted extractor field에서 canonicalize한다.

## 8. 추천, 급상승, RAG read model

### 8.1 단일 추천 실행

Home, 오늘의 추천, Entry, Final은 동일한 최신 eligible `SourcingRecommendationRun`을 서로 다른 presenter로 읽는다. 화면별 scorer를 두지 않는다.

- server가 model/policy/calculation version을 저장한다.
- exact observation IDs와 cutoff를 manifest로 고정한다.
- score/grade/baseline action은 item에 한 번만 기록한다.
- client는 정렬·필터 같은 presentation만 한다.
- local cached item이 server item보다 높은 점수라는 이유로 승격되지 않는다.

현재 UI의 `order | observe_3d | exclude` 또는 `source_now | track | hold | drop`은 presenter label이다. canonical `test_order | hold | reject` decision이나 procurement authorization이 아니다.

### 8.2 급상승

- detect POST 결과와 latest GET은 같은 persisted run을 직렬화한다.
- `confidence`, `dataGaps`, 실제 Naver/Wing/source coverage를 run에 저장한다.
- `model.stats.keywordCount`를 trend count로 재해석하지 않는다.
- Home과 Rising 화면은 같은 cache identity와 invalidation signal을 사용한다.

### 8.3 RAG

RAG index identity는 최소 다음을 포함한다.

- organization
- input content hash / source run IDs
- `days`
- evidence cutoff
- index/schema version

관심 키워드, 추천, validation mutation은 관련 index를 invalidate한다. 첫 daily query가 하루 전체의 `days`와 source snapshot을 고정하지 않는다.

### 8.4 browser cache

- 가능하면 서버 read model의 HTTP cache만 사용한다.
- 필요한 browser cache key는 `organizationId + user/session + schemaVersion + businessDate`를 포함한다.
- logout과 active organization 변경 시 sourcing cache를 비운다.
- browser cache는 화면 skeleton/last-known-good hint일 뿐 snapshot save나 recommendation input이 아니다.
- storage schema version bump로 기존 global cache를 cutover 시 무효화한다.

## 9. 실제 상품 검증과 검토 handoff

### 9.1 검증 항목

`SourcingValidationEpisode`는 다음 check를 독립적으로 기록한다.

- Coupang 수요·경쟁 강도와 freshness
- exact 1688 offer/variant identity
- 가격, MOQ, price tier, supplier freshness
- 환율·국제/국내 물류·수수료를 포함한 landed-cost input completeness
- 목표 판매가와 expected contribution margin
- KC/안전, IP/licensing, 품질/QC readiness
- 요구 관찰 기간과 data gaps

값을 관측하지 못했으면 `missing`, `pending`, `not_applicable` 중 하나로 표현한다. 91점, 28.5% 같은 fixture 값을 대체값으로 사용하지 않는다.

### 9.2 selection과 final handoff

- Entry/Final의 선택은 `SourcingReviewSelection`에 저장한다.
- item이 새 recommendation run에서 사라졌거나 stale이면 handoff 전에 명시적 재검증한다.
- Final CTA는 selected recommendation/validation/offer version을 `SourcingReviewBatch`로 고정한다.
- UI는 `awaiting_procurement_enablement`와 batch ID를 표시한다.
- 이 경로에서 `SourcingDecisionBatch`, `ProcurementTestIntent`, PO, provider submission을 만들지 않는다.

canonical decision center 연결과 procurement enablement는 별도 설계·승인·PR로 다룬다. 현재 route에서 canonical pipeline이 보이지 않는 문제를 가짜 발주 동작으로 우회하지 않는다.

## 10. 14개 화면별 backend 계약

| 화면 | 유지할 UI 기능 | 새 backend owner / read model | 이번 전환의 핵심 변화 |
|---|---|---|---|
| 소싱 홈 | 요약, 트렌드 실행, 랭킹 | recommendation/rising aggregator + Ads rank read | global local rows 제거, 공통 freshness/status |
| 시장 분석 | overview/radar/collect/competitor/Wing 탭 | coordinator + market presenter + Ads boundary | static competitor 영역은 research 표시 유지, snapshot 전체 replace 제거 |
| 키워드 분석 | popular/trend/autocomplete/Coupang/Naver, 제외 | keyword read model + interest/selection commands | 1,719줄 component의 저장·merge 책임을 서버로 이동 |
| 카테고리 소싱 | trend source와 수집 | shared trend API/read model | 축약 API 계약을 공통 schema로 통합 |
| 경쟁업체 분석 | DB overview, extension collection | Ads owner, sourcing handoff 없음 | 현재 기능 유지, 경계만 명시 |
| 쿠팡 상품 분석 | Wing 검색과 추적 | Extension capture + Ads tracked DB | ephemeral 검색은 유지, 자동 sourcing candidate 생성 안 함 |
| 상품 추적 | history, refresh, delete | Ads owner | bounded batch refresh와 오류 집계 |
| 급상승 탐지 | latest/detect/tracker | persisted rising run presenter | POST/GET confidence와 gaps 일치 |
| 오늘의 추천 | 추천 조회와 수집 | common recommendation run | client scorer/cache-primary 제거 |
| 도매 상품 검색 | keyword/image search, 자동 수집 | coordinator + 1688 typed observations | keyed atomic write, missing-first, stable offer identity |
| 의사결정 센터 | 추천 탐색·선택·제외 | entry presenter + review selection | 현재 UI 유지; canonical procurement 용어로 위장하지 않음 |
| 상품 검증 | 검증 상태·점수·액션 | validation episode/check | fixture 제거, 실제 input만 표시 |
| 최종 선택 | shortlist, RAG, handoff | recommendation + validation + review batch | server score 단일화, no-op 대신 safe batch 생성 |
| 소싱 설정 | 관심 키워드 추가/삭제 | `SourcingInterestTarget` commands | whole-document GET→PUT 제거 |

화면에서 현재 handler가 없는 검색 hero나 ranking filter는 이번 backend reconstruction에서 시각적으로 제거하지 않는다. 해당 control은 기존 실제 query/filter command에 연결하고, 서버 contract가 없는 경우 disabled 이유를 명시한다. 동작하지 않는 enabled control 상태는 허용하지 않는다.

## 11. 오류·상태·복구 계약

### 11.1 오류 분류

| 분류 | 예 | 재시도 | UI 표현 |
|---|---|---|---|
| permission | entitlement missing/expired/killed | 검토 전 불가 | unavailable + 관리자 안내 |
| validation | malformed extension/provider payload | 수정 전 불가 | failed item count + reason |
| conflict | idempotency hash/version/CAS conflict | 최신 read 후 가능 | 충돌 안내 또는 자동 safe retry |
| provider transient | timeout, 429, 5xx | backoff 후 가능 | collecting/partial failure |
| stale | older capturedAt, expired offer | 새 수집 필요 | last-known-good + stale badge |
| cancelled/superseded | user cancel, newer generation | 필요 시 새 run | cancelled, 성공 toast 금지 |
| internal | invariant/DB failure | 자동 제한 재시도 | error ID와 unavailable |

### 11.2 last-known-good

- source별 entitlement의 `maxStalenessSeconds` 안에서만 제공한다.
- stale reason과 last successful capture를 함께 반환한다.
- 오래된 local row가 있다는 이유로 최신 server failure를 숨기지 않는다.
- malformed 한 행이 org 전체 read를 500으로 만들지 않도록 ingest에서 reject하고 read path는 validated rows만 소비한다.

### 11.3 assistant runtime

assistant 생성 기능은 CLI flag를 security boundary로 사용하지 않는다.

- 우선안은 filesystem/tool access가 없는 provider API/SDK 호출이다.
- CLI를 임시 유지하면 repo와 secret이 mount되지 않은 별도 sandbox/user에서 실행하고 network allowlist, process semaphore, timeout, input/output byte limit을 적용한다.
- 안전한 sandbox를 제공할 수 없으면 retrieval-only 응답으로 명시적으로 degrade한다.
- 모든 prompt와 RAG text는 untrusted data로 취급한다.
- endpoint에는 per-org/per-user rate limit, 최대 동시 실행 수, 비용·시간 budget을 적용한다.

## 12. 클린 reset과 cutover

### 12.1 보존 정책

기존 sourcing 데이터를 새 schema로 backfill하지 않는다. reset 대상은 다음 sourcing-owned 상태다.

- trend seed, typed daily source snapshot, workspace/recommendation/RAG projection
- interest, selection, validation state
- entitlement/evidence runs/observations
- sourcing launch/decision state
- downstream reference가 없는 sourcing candidates/images
- Supply가 확인한 downstream reference 없는 sourcing-origin offer/intent rows

절대 삭제하지 않는 대상:

- `ProductPreparation`
- `MasterProduct`
- `ChannelListing`
- 실제 주문, 입출고, 재고, 정산, 광고 성과
- 위 downstream record가 provenance로 참조하는 sourcing candidate와 필요한 image/provenance row

candidate 자체 또는 candidate image를 Product, Channel, Content, Order 등 non-sourcing row가 직접·간접 참조하면 candidate 전체를 보호 대상으로 분류한다. 보호된 candidate는 `isDeleted = true`, `deletedAt`, archived status로 UI에서 제외하되 FK provenance를 유지한다. cascade delete를 사용하지 않는다.

### 12.2 reset 도구 계약

data migration은 explicit allowlist와 두 단계 실행을 사용한다.

1. dry run이 테이블별 purge 수, protected candidate 수, cross-domain reference 수를 출력한다.
2. 예상하지 못한 참조 종류가 하나라도 있으면 execute를 거절한다.
3. operator가 report를 검토한 뒤 명시적 execute flag로 실행한다.
4. dependency 순서대로 sourcing/Supply-owned row만 삭제 또는 archive한다.
5. protected downstream row는 update/delete하지 않는다.
6. 실행 결과와 row count를 audit log로 남긴다.

현재 release train이 유지되면 script 위치는 `scripts/data-migrations/v0.1.30/005_reset_sourcing_runtime_state.ts`다. 구현 전에 active `VERSION`과 사용 중인 sequence를 다시 확인하고 충돌 시 해당 train의 다음 sequence를 사용한다.

### 12.3 entitlement seed

reset 후 Naver, 1688 server collector, Shorts/TikTok, Coupang Wing Extension, 1688 Extension source manifest로 fresh entitlement version을 생성한다.

- 실행 시 `reviewedByUserId`를 필수로 받는다.
- 해당 사용자가 조직의 허용된 reviewer인지 검증한다.
- legal basis, allowed method, permitted fields, rate limit, expiry, retention, max staleness를 manifest에 명시한다.
- placeholder reviewer나 system user로 자동 서명하지 않는다.
- seed 실패 시 collection은 fail closed하고 UI는 unavailable을 표시한다.

### 12.4 bootstrap

entitlement seed가 성공하면 server operation이 다음 순서로 자동 bootstrap한다.

1. interest/default seed 확인
2. source별 bounded collection
3. evidence/typed observation commit
4. rising/market/recommendation run 생성
5. validation 대상 준비
6. projection/RAG index 생성
7. 14개 read model coverage/freshness 검증

bootstrap은 idempotent하며 실패 source만 재시도할 수 있다. UI는 bootstrap 동안 빈 데이터가 아니라 `collecting`을 보여준다.

### 12.5 배포 순서

네 PR은 `develop`에 순차 병합하되 일부만 Office에 promote하지 않는다.

1. **Collection control plane**: entitlement preflight, lease/idempotency, freshness, extension v1 translation, URL/assistant hardening
2. **Normalized schema**: interest, offer-keyword observation, recommendation, validation, review selection/batch, indexes/FKs, reset/bootstrap tooling
3. **Server read models**: shared scorer, rising/RAG consistency, validation engine, 14-screen presenters and new Web clients
4. **Atomic cutover and cleanup**: old client snapshot writes/scorers 제거, cache version bump, reset→seed→bootstrap runbook, dead backend paths 정리, end-to-end/performance gates

Office cutover 순서:

```text
maintenance 시작
-> sourcing write ingress 중지
-> DB backup/checkpoint
-> schema 적용
-> 새 artifact를 sourcing cutover-closed mode로 배포
-> reset dry-run 및 operator 확인
-> allowlisted reset 실행
-> entitlement seed
-> bootstrap
-> 14-screen canary
-> sourcing ingress 재개
```

운영 dual-write, dual-read, legacy fallback 기간은 없다. bootstrap이 실패하면 sourcing 화면은 `collecting/unavailable`을 유지하고 신규 쓰기를 닫는다. old snapshot을 다시 canonical input으로 승격하지 않는다.

cutover-closed mode에서는 health/admin cutover endpoint와 sourcing read의 `collecting/unavailable` 응답만 허용한다. bootstrap 성공 뒤 canary mode에서 지정 reviewer만 14개 화면을 검증하고, 성공해야 일반 write ingress를 연다.

## 13. 테스트와 검증

### 13.1 domain/unit tests

- missing/expired/killed entitlement에서 provider spy 호출 0회, DB observation 0행
- external IO 중 entitlement version/expiry 변경 시 commit 0행
- observation retry는 full envelope가 같을 때만 duplicate success
- identity hash가 URL tracking parameter와 array order에 독립적
- score/grade/action은 한 server model version에서만 생성
- validation input 누락 시 fabricated score/margin 없음
- review batch 생성이 procurement intent/PO/provider call을 만들지 않음
- rising POST/GET confidence와 data gaps round-trip 일치
- RAG cache key가 days/content hash/cutoff 변경을 반영

### 13.2 실제 PostgreSQL integration tests

- 20개 concurrent 동일 request가 active run 하나만 생성
- concurrent interest add/remove와 review selection에서 lost update 없음
- concurrent 1688 keyword/offer commit이 provenance를 모두 보존
- stale capturedAt commit이 최신 행을 덮지 않음
- `P2002`/`P2003` 후 aborted transaction 재사용 없음
- organization composite FK와 cross-org IDOR 차단
- reset dry-run/execute가 downstream-protected candidate를 archive하고 나머지만 제거
- batch evidence ingest가 constraint conflict를 deterministic하게 보고

실제 PG suite는 mock 통과로 대체하지 않는다. destructive `db push --accept-data-loss`가 필요한 격리 DB setup은 승인된 test DB 경로에서만 실행한다.

### 13.3 HTTP/Extension contract tests

- 실제 1688 extractor fixture를 global `ValidationPipe`를 포함한 HTTP stack에 통과시켜 price/MOQ/supplier/SKU/tier가 보존되는지 검증
- extension v1과 v2 payload 모두 같은 canonical observation을 생성
- collection session/entitlement가 없으면 v1/v2 모두 commit 0행
- redirect를 포함한 private/local/metadata URL 거절
- malformed one-item ingest가 전체 org read를 500으로 만들지 않음
- error와 empty data의 response envelope 차이 검증

### 13.4 Web end-to-end

- 14개 route가 `ready | collecting | stale | unavailable`을 올바르게 표현
- refresh/re-entry가 active operation을 중복 생성하지 않음
- bulk 전체 실패에서 성공 toast 없음
- org switch 후 이전 조직 추천/선택/cache 노출 없음
- validation 화면에 fixture 값 없음
- Final handoff가 batch ID를 반환하고 Supply/PO side effect는 없음
- table row와 interactive control의 keyboard 접근성 유지

### 13.5 성능 목표

- cached screen read model p95: 300 ms 이하
- command acceptance p95: 500 ms 이하, provider 완료 시간 제외
- list API: cursor pagination과 서버 상한 필수
- evidence: validation 후 bounded batch write
- product tracking refresh: bounded concurrency, 무제한 N+1 금지
- RAG/recommendation: input hash가 같으면 immutable run 재사용

부하 테스트는 source별 concurrency, 1688 observation volume, 14-screen 동시 조회, assistant process budget을 포함한다.

## 14. 운영 관측과 retention

필수 metric:

- collection run duration/status/retry/cancel/supersede
- provider call count, rate-limit wait, timeout
- entitlement deny/expiry/version-change/kill-switch
- discovered/accepted/rejected/duplicate/stale-discarded count
- source coverage와 freshness
- recommendation/validation input coverage와 data gaps
- projection lag와 rebuild count
- extension schema version과 unknown-field count
- assistant queue/concurrency/timeout/cost

필수 structured log key:

- organizationId
- operationId / ingestionRunId
- sourceKey / targetKey
- entitlement version hash
- schema/model/policy version
- error code와 retryability

Retention:

- source별 entitlement `retentionDays`를 background purge policy에 반영한다.
- decision/review/supply provenance가 참조하는 observation은 보존한다.
- unreferenced raw payload는 작은 batch와 cursor로 삭제한다.
- projection과 RAG index는 TTL 만료 시 즉시 재생성 가능하다.
- purge job에도 organization scope, lease, bounded batch, metric을 적용한다.

## 15. Rollback과 안전장치

- destructive reset 전 Office DB backup/checkpoint를 만든다. 이는 legacy migration input이 아니라 단기 운영 rollback 수단이다.
- schema 변경은 additive하게 먼저 배포 가능한 형태로 작성하고 destructive column/table 제거는 마지막 cleanup 이후 별도 확인한다.
- reset 후 bootstrap 실패 시 신규 collection ingress를 닫고 화면을 `collecting/unavailable`로 유지한다.
- downstream Product/Channel/Order row는 reset과 rollback 어느 쪽에서도 수정하지 않는다.
- old browser cache와 workspace snapshot을 rollback source로 사용하지 않는다.
- permission 또는 source manifest가 불완전하면 기능 가용성보다 fail-closed를 우선한다.

## 16. 구현 완료 조건

다음 조건이 모두 충족되어야 안정화가 완료된 것으로 본다.

1. 14개 화면의 사용자 기능이 유지되고 fixture/no-op/false-success가 제거된다.
2. 모든 external collection과 extension commit 앞에 strict entitlement가 적용된다.
3. client whole-document snapshot write와 authoritative global localStorage가 없다.
4. 관심, offer observation, 추천, 검증, 선택, review batch가 normalized server state다.
5. recommendation score/identity/freshness의 source of truth가 하나다.
6. actual PG concurrency/constraint suite와 actual extension fixture contract가 통과한다.
7. reset이 downstream-protected row를 보존한다는 dry-run 및 integration evidence가 있다.
8. entitlement seed와 bootstrap이 idempotent하게 완료된다.
9. Office에서 14-screen canary와 performance 목표를 만족한다.
10. procurement intent, PO, provider call은 이 reconstruction으로 새로 열리지 않는다.

## 17. 결정 기록

| 질문 | 결정 |
|---|---|
| UI를 바꾸는가 | 화면과 기능은 유지하고 backend/data ownership만 재구축 |
| 기존 sourcing 데이터가 필요한가 | 아니오; backfill 없이 reset |
| downstream 참조 candidate도 삭제하는가 | 아니오; archived provenance로 보존 |
| Web API 호환이 필요한가 | 같은 릴리스 내 변경 가능 |
| Extension API 호환이 필요한가 | 배포된 v1 호환 필수 |
| entitlement는 soft warning인가 | 아니오; strict preflight와 commit-time recheck |
| reset 뒤 데이터는 어떻게 채우는가 | reviewed entitlement seed 후 server bootstrap |
| 상품 검증은 fixture를 유지하는가 | 아니오; 실제 validation episode로 교체 |
| 최종 선택이 발주를 만드는가 | 아니오; immutable review batch까지만 생성 |
| delivery 단위는 | 순차 4 PR, Office는 전체 완료 후 atomic cutover |
| 운영 dual-read/dual-write를 두는가 | 아니오 |
