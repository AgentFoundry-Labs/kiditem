# advertising — Ad Operations

광고 관리 도메인. products 3-layer schema (MasterProduct / ProductOption / ChannelListing) 기반.
Multi-tenant scope rule 준수 — 모든 service 가 companyId 말미 파라미터 + `@CurrentCompany()` decorator 를 통해 전파.

## Reconstruction note

Advertising domain은 **backend architecture contract topology**를 따른다 (`apps/server/AGENTS.md` + `docs/superpowers/plans/2026-04-29-backend-architecture-contract.md`):

- `adapter/in/http/` — HTTP entrypoints (controller)
- `adapter/out/prisma/` — Prisma persistence adapters (`*.persistence.ts`) + query adapters (`*.query.ts`)
- `application/service/` — NestJS @Injectable application services + ingest handlers + listing-ad-metric accumulator (Wave H2 Lane AD: 13 orchestration services 흡수 완료, 2026-04-30)
- `domain/` — pure business rules (no NestJS/Prisma imports)
- `dto/` — HTTP DTOs (class-validator)
- `mapper/` — boundary row/DTO/domain mapping
- `services/` — transitional. 단 한 개 `channel-scrape-persistence.service.ts` (compatibility facade for two integration tests; 실제 로직은 `adapter/out/prisma/*.persistence.ts`에 있다). 신규 NestJS application service 는 `application/service/`에 둔다.
- `util/` — pure helpers (`ad-target-key.ts`, `ratio-recompute.ts`). Domain-level이지만 contract folder 가 아닌 transitional location. 새 도메인은 이 패턴을 답습하지 않는다.

## Hard rewrite (2026-04-27) — post-rewrite contract

Channel market-data pipeline was rewritten in 4 phases (H1 schema → H2 ingest → H3 reads → H4 deletion). Legacy models `Ad` / `AdSnapshot` / `TrafficStats` / `ItemWinner` are gone. The current architecture below is the only supported contract.

### Source-of-truth model

| Concern | Source | Where |
|---|---|---|
| Per-listing/day metrics + observed state | `ChannelListingDailySnapshot` | `channels.prisma` |
| Per-option/day metrics + observed state | `ChannelListingOptionDailySnapshot` | `channels.prisma` |
| Per-target/day ad metrics (campaign/keyword/product grain) | `ChannelAdTargetDailySnapshot` | `channels.prisma` |
| Account-level KPI (Wing dashboard, coupang_ads_daily aggregate) | `ChannelAccountDailyKpiSnapshot` | `channels.prisma` |
| Raw audit/replay row | `ChannelScrapeRun` + `ChannelScrapeSnapshot` | `channels.prisma` |

### Permanent rules

- **Daily facts are source-of-truth** for listing/option/day market data. Period views (7d/14d/month/custom) derive from `SUM(additive metric)` over the requested `businessDate` window. No period-specific source tables.
- **Ratios recompute from sums** via `apps/server/src/advertising/util/ratio-recompute.ts`:
  - ROAS = `SUM(adRevenue) / SUM(adSpend) * 100`
  - CTR = `SUM(adClicks) / SUM(adImpressions)`
  - CVR = `SUM(adConversions) / SUM(adClicks)`
  Provider ratios live in `metaJson` for audit only.
- **Overwrite-on-replay metric semantics** — provider-supplied daily totals are written by overwrite (not increment). Same payload twice → same value (idempotent). `sampleCount` increments per observation.
- **Raw row first** — every payload appends `ChannelScrapeSnapshot` before daily-fact upsert. Daily-fact failure must not lose raw data.
- **`metaJson` is caller-source namespaced** — `{ source: '<logical-source>', data: {...} }`. Helper merges via read → spread → write. Source key collision forbidden. Current sources: `advertising.campaign`, `advertising.campaign.target`, `advertising.raw`, `advertising.raw.target`, `wing.traffic`, `wing.itemwinner`, `traffic.csv_upload`.
- **Dev data replay uses the same ingest path** — Google Drive Coupang bundles are replayed through `POST /api/ads/extension/sync`. Synthetic `seed-channel-market-data` style writers are not supported because they bypass the real extension/Wing normalization path.
- **`buildAdTargetKey()` single source** — `apps/server/src/advertising/util/ad-target-key.ts` builds `ChannelAdTargetDailySnapshot.targetKey`. Patterns: `campaign:<id|name>` / `keyword:<id|name>:<adGroup>:<keyword>` / `product:<externalId|listingId>:<id|name>`. Throws when no usable identifier — no `unknown:unknown` rows.
- **Account/store KPI rules** — listing 에 귀속되지 않는 dashboard KPI 는 `ChannelAccountDailyKpiSnapshot` 으로 land. `kpiType`: `wing_dashboard` (traffic/dashboard payload), `wing_itemwinner_kpi` (raw_scrape wing kpi), `advertising_campaign_kpis` (ad_campaign top-level kpis), `coupang_ads_daily` (coupang ads daily aggregate).
- **`AdAction.adTargetDailyId`** — `AdAction` 의 source row 는 `ChannelAdTargetDailySnapshot.id`. 이전 `snapshotId`/`AdSnapshot` 컬럼은 H4 에서 제거됨.
- **Multi-tenant**: 모든 read 는 `companyId` 를 WHERE 에 포함. Single-resource GET/PATCH/DELETE 는 `findFirst({ where: { id, companyId } })`.

### Cross-domain coupling exception

`ChannelScrapeRun` / `ChannelScrapeSnapshot` / `ChannelListing*DailySnapshot` / `ChannelAdTarget*` / `ChannelAccount*` 은 channels namespace 의 Prisma 모델이지만 **advertising 도메인이 dual-write/read** 한다. 이유:

- scrape ingestion 진입점이 `/api/ads/extension/sync` 하나라 advertising 안에서 raw + normalized 를 같이 쓰는 게 trace 가 단순.
- `ChannelSyncService` 인젝션은 금지 (`apps/server/AGENTS.md` service-to-service 규칙).
- helper: `ChannelScrapePersistenceService` (`apps/server/src/advertising/services/channel-scrape-persistence.service.ts`). 실제 로직은 `adapter/out/prisma/channel-scrape-run.persistence.ts` / `channel-daily-fact.persistence.ts` / `channel-account-kpi.persistence.ts` 에 분리되어 있고, 이 service 는 transitional facade이다. `PrismaService` 만 의존하며 channels namespace 모델을 직접 만진다.
- run lifecycle: `createRun(status:'running')` → `appendSnapshot(...)` × N → `finalizeRun(status:'complete')`. 실패 시 `finalizeScrapeRunOnError(...)` 로 `status:'error'` + `errorJson` 저장.

다른 도메인이 같은 패턴을 쓸 때까지는 advertising-local 로 유지.

## Structure

- **Controller**: `adapter/in/http/advertising.controller.ts` — all `/api/ads/*` routes (14+ endpoints), `@CurrentCompany()` 주입
- **Persistence adapters**: `adapter/out/prisma/*.persistence.ts` — `ad-action` / `ad-execution` / `channel-scrape-run` / `channel-daily-fact` / `channel-account-kpi` / `scrape-target`
- **Query adapters**: `adapter/out/prisma/*.query.ts` — `ad-action` / `ad-benchmark` / `ad-campaign` / `ad-listing` / `ad-strategy-context` / `ad-sync-listing-map`
- **Application services**: `application/service/`
  - Orchestration / use-case (NestJS @Injectable, controller가 직접 주입): `advertising`, `ad-campaigns`, `ad-strategy`, `ad-grade-rules`, `ad-budget-allocator`, `ad-exposure`, `ad-recommend`, `ad-benchmark`, `ad-collect`, `ad-sync`, `ad-action`, `ad-execution`, `ad-config` (13 services)
  - Source-specific ingest handlers (function-style, AdSyncService 가 dispatch): `ad-campaign-ingest.handler`, `raw-scrape-ingest.handler`, `traffic-ingest.handler`, `coupang-ads-daily-ingest.handler` + `listing-ad-metric-accumulator`
- **Domain**: `domain/` — pure ad rules + helpers (`ad-action-rules`, `ad-execution-error-scrubber`, `ad-metrics`, `business-date`, `listing-match`, `scrape-row-normalizers`, `strategy-context`)
- **Mappers**: `mapper/` — `ad-campaign.mapper.ts`, `ad-listing.mapper.ts`, `ad-strategy.mapper.ts`
- **Transitional facade (services/)**: `services/channel-scrape-persistence.service.ts` only — thin @Injectable wrapper over `adapter/out/prisma/channel-scrape-run.persistence.ts` / `channel-daily-fact.persistence.ts` / `channel-account-kpi.persistence.ts`. Kept because two integration tests inject the class directly. New callers should import the persistence functions from `adapter/out/prisma/` instead.
- **Frontend**: `apps/web/src/app/ad-ops/` — 4 탭 (status / strategy / campaign / exposure)
- **DB**: AdAction (listingId nullable, targetType ∈ {'campaign','keyword'}, `adTargetDailyId` → ChannelAdTargetDailySnapshot), ScrapeTarget, ExecutionTask, ExecutionLog, ExecutionWorker
- **Shared**: `@kiditem/shared/schemas/ads` — listingId-primary, nested masterProduct{code,name} + option{sku,optionName}

## Data Flow

```
Extension scrape (Coupang vendor_item_id, external_id)
    ↓ POST /api/ads/extension/sync
AdSyncService.sync
  ↳ buildListingMap(companyId): externalOptionIdMap + externalIdMap
       ↳ externalOptionIdMap entries carry { listingId, listingOptionId, optionId|null, externalId }
  ↳ matchListingFromRow returns ListingMatch { listingId, listingOptionId, optionId, externalId, externalOptionId } 우선순위:
      1) Coupang vendorItemId → ChannelListingOption.externalOptionId → {listingId, listingOptionId, optionId|null}
      2) externalId → ChannelListing.externalId + platform='coupang' → {listingId, listingOptionId:null, optionId:null}
      3) 매칭 실패 → matchStatus='unmatched' (raw snapshot 보존, daily-fact upsert skip)
  ↓ ChannelScrapeRun + ChannelScrapeSnapshot (raw audit/replay — always first)
  ↓ ChannelListingDailySnapshot upsert (listing-day state + ad/traffic 가산 metrics)
  ↓ ChannelListingOptionDailySnapshot upsert (option-day state — Wing item-winner only currently)
  ↓ ChannelAdTargetDailySnapshot upsert (campaign/keyword/product grain)
  ↓ ChannelAccountDailyKpiSnapshot upsert (account/store-level KPI)
  ↓ ad-strategy.calcActions listing 단위 aggregate
  ↓ AdAction create (targetType: 'campaign' | 'keyword'; adTargetDailyId set)
  ↓ execution-worker lease → markRunning → markDone/markFailed
  ↓ ExecutionLog 감사
```

### Daily-fact upsert (ChannelListing/Option) semantics

- **create path**: `sampleCount = 1`, `firstObservedAt = lastObservedAt = now`, observable field set, `rawSnapshotId` link.
- **update path**: `sampleCount: { increment: 1 }`, `lastObservedAt = now`, `rawSnapshotId` 는 최신 관측 row 로 갱신, `firstObservedAt` 보존. observable field 는 caller 가 explicit non-null 일 때만 overwrite.
- listing-only match (vendorItemId miss → externalId fallback) 는 listing daily 만 land. option daily 는 `match.listingOptionId !== null` 일 때만.
- option daily 는 internal `optionId === null` 이어도 land (`listingOptionId` 만으로 충분).
- 관측 가능한 field 가 하나도 없으면 normalizer 가 `null` 반환 → upsert skip.

### KST business date

`payload.timestamp` 같은 ISO 문자열은 `+09:00` shift 후 day slice. `YYYY-MM-DD` 형태는 이미 KST business date 로 간주. helper `toBusinessDate()` 한 곳에서만 처리 — handler 가 직접 `new Date(...).slice(0,10)` 하지 말 것.

### Strategy state evidence (read-only)

`AdStrategyService.loadStrategyContext` 가 listing hydrate 후 `loadChannelStateByListing(...)` 로 latest `ChannelListingDailySnapshot` (per listing) + latest `ChannelListingOptionDailySnapshot` (per primary listingOption) 을 fetch 해 `ChannelStateSignal` map 으로 hydrate. `AdGradeRulesService.calcActions` 가 evidence 를 `AdStrategyAction.channelState` 에 attach. adverse signal 일 때만 reason 끝에 evidence fragment 추가. 자동 동작/threshold 변경 없음.

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/ads` | 광고 현황 (listings + summary: gradeSpend, tierSpend, gradeSpendPercent) |
| `GET /api/ads/campaigns` | 캠페인 스냅샷 (period 필터) |
| `GET /api/ads/campaigns/trends` | 일별 트렌드 + 전후반 비교 + ABC 예산 분배 |
| `GET /api/ads/strategy/rules` | ABC 등급별 규칙/추천 (실시간 계산, 에이전트 미의존) |
| `GET /api/ads/strategy/plan` | 주간 액션 플랜 |
| `GET /api/ads/strategy/recommend` | AI 전략 추천 카드 |
| `GET /api/ads/strategy/exposure` | 노출 분석 |
| `POST /api/ads/strategy/register` | 캠페인 등록 (listings + IDOR + duplicate 차단) |
| `GET /api/ads/benchmark` | 업계 평균 대비 진단 (listing-primary) |
| `POST /api/ads/collect` | 데이터 수집 (→ 익스텐션 안내) |
| `GET /api/ads/collect/status` | 수집 상태 확인 |
| `POST /api/ads/extension/sync` | 익스텐션 데이터 수신 (ad_campaign / raw_scrape / traffic / coupang_ads_daily) |
| `GET /api/ads/extension/status` | 익스텐션 연결 상태 (`wing.kpis` 포함) |
| `GET /api/ads/scrape-targets` | 스크래핑 대상 URL 목록 |
| `POST /api/ads/scrape-targets` | 스크래핑 대상 생성/markScraped |
| `DELETE /api/ads/scrape-targets/:id` | 스크래핑 대상 비활성화 |
| `POST /api/ads/actions/*` | AdAction lifecycle (generate / approve / reject / markRunning / markDone / markFailed / resetFailed) |

## 액션 자동 실행 파이프라인

```
ChannelAdTargetDailySnapshot (latest businessDate per targetKey, source-of-truth)
    ↓ ad-action.generateActions 5 규칙 평가
AdAction (실행 대기 큐, targetType: campaign|keyword, adTargetDailyId 보유)
    ↓ execution-worker lease
ExecutionTask (처리 중인 작업)
    ↓ 완료 시
ExecutionLog (감사 로그)
```

## AdAction 규칙 (5 규칙, target-daily 기반)

| Rule | 조건 | actionType | targetType | priority |
|---|---|---|---|---|
| 1 | stock=0 AND campaign AND dailyBudget>0 | change_daily_budget | campaign | urgent (proposedValue=3000) |
| 2 | keyword AND (zero conversion AND spend≥5000 OR roas∈(0,100)) | pause_keyword | keyword | A=high / else urgent |
| 3 | keyword AND roas∈[100,200) | change_bid | keyword | profit<0 ? high : medium (bid*0.85) |
| 4 | campaign AND grade=A AND roas≥480 | change_daily_budget | campaign | high (budget*1.2) |
| 5 | campaign AND (grade=C OR roas<100) AND dailyBudget>3000 | change_daily_budget | campaign | C=high / else medium (max(3000, budget*0.5)) |

Rule 1 은 target row 의 `listingOptionId` null 일 때 skip (option stock 판정 불가). Stock signal: 우선 latest `ChannelListingOptionDailySnapshot.stockQty`, fallback live `ProductOption.availableStock`. Either === 0 → fire.

ROAS 는 row 자체의 `revenue`/`spend` 로 `recomputeRoas()` 계산. provider ratio 신뢰 안 함.

Threshold (5000 / 100/200/480 / 0.85 / 1.2 / 0.5 / 3000) 는 현재 하드코딩.

## targetType 값

`services/types.ts` 의 `AD_ACTION_TARGET_TYPES = ['campaign', 'keyword'] as const` 사용.

## Multi-tenant scope rule 준수

- 모든 service 메서드는 `companyId: string` 을 **마지막 파라미터** 로 받음
- `getDefaultCompanyId()` / `prisma.company.findFirst({isActive:true})` 금지
- IDOR 방지: GET/PATCH/DELETE 단일 리소스 접근 시 `findFirst({id, companyId})`

## Matching 우선순위 불변

`ad-sync.buildListingMap` 의 2-tier lookup 은 이 도메인의 정의상 invariant. 멀티채널 확장 (네이버 / 11번가) 시 platform 별 externalIdMap 분리 필요.

## 참고

- 모델 스펙: [`prisma/models/advertising.prisma`](../../../../prisma/models/advertising.prisma) + [`prisma/models/channels.prisma`](../../../../prisma/models/channels.prisma)
- 3-layer 책임 분리 규칙: [`apps/server/src/products/CLAUDE.md`](../products/CLAUDE.md)
- Hard rewrite 4-phase implementation plan: [`docs/superpowers/plans/2026-04-27-channel-market-data-hard-rewrite-implementation-plan.md`](../../../../docs/superpowers/plans/2026-04-27-channel-market-data-hard-rewrite-implementation-plan.md)
