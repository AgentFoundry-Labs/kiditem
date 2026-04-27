# advertising — Ad Operations

광고 관리 도메인. ADR-0013 3-layer schema (MasterProduct / ProductOption / ChannelListing) 기반.
ADR-0006 준수 — 모든 service 가 companyId 말미 파라미터 + `@CurrentCompany()` decorator 를 통해 전파.

## Structure

- **Controller**: `advertising.controller.ts` — all `/api/ads/*` routes (14+ endpoints), `@CurrentCompany()` 주입
- **Services**: advertising / ad-campaigns / ad-strategy / ad-benchmark / ad-collect / ad-sync / ad-action / ad-execution / ad-config (9 services)
- **Frontend**: `apps/web/src/app/ad-ops/` — 4 탭 (status / strategy / campaign / exposure). Plan D 에서 신 shared schema consume
- **DB**: Ad (listingId required + optionId nullable), AdSnapshot (pageType ∈ {'campaign','keyword','product'}, level ∈ {'campaign','product',null}), AdAction (listingId nullable, targetType ∈ {'campaign','keyword'}), ItemWinner, ScrapeTarget, ExecutionTask, ExecutionLog, ExecutionWorker
- **Shared**: `@kiditem/shared/schemas/ads` — listingId-primary, nested masterProduct{code,name} + option{sku,optionName}

## Data Flow

```
Extension scrape (Coupang vendor_item_id, external_id)
    ↓ POST /api/ads/extension/sync
AdSyncService.sync
  ↳ buildListingMap(companyId): externalOptionIdMap + externalIdMap
       ↳ Wave C2: externalOptionIdMap entries carry { listingId, listingOptionId, optionId|null }
  ↳ matchListingFromRow returns ListingMatch { listingId, listingOptionId, optionId } 우선순위:
      1) Coupang vendorItemId → ChannelListingOption.externalOptionId → {listingId, listingOptionId, optionId|null}
      2) externalId → ChannelListing.externalId + platform='coupang' → {listingId, listingOptionId:null, optionId:null}
      3) 매칭 실패 → matchStatus='unmatched' (snapshot 보존, AdSnapshot 만 저장 — Ad/TrafficStats skip)
  ↓ ChannelScrapeRun + ChannelScrapeSnapshot dual-write (Wave C2 — channel-generic raw layer)
  ↓ AdSnapshot / Ad / TrafficStats / ItemWinner upsert (legacy facts, listingId null 이면 Ad/TrafficStats skip)
  ↓ ad-strategy.calcActions listing 단위 aggregate
  ↓ AdAction create (targetType: 'campaign' | 'keyword')
  ↓ execution-worker lease → markRunning → markDone/markFailed
  ↓ ExecutionLog 감사
```

## Wave C2 — Channel-generic raw scrape dual-write (영구 규칙)

`ChannelScrapeRun` / `ChannelScrapeSnapshot` 은 channels namespace 의 Prisma 모델이지만 **advertising 도메인이 dual-write** 한다. cross-domain coupling 회피용 예외:

- 이유: scrape ingestion 진입점이 `/api/ads/extension/sync` 하나라 advertising 안에서 raw + normalized 를 같이 쓰는 게 trace 가 단순. `ChannelSyncService` 인젝션은 금지 (`apps/server/AGENTS.md` 의 service-to-service 규칙).
- helper: `ChannelScrapePersistenceService` (`apps/server/src/advertising/services/channel-scrape-persistence.service.ts`). `PrismaService` 만 의존하며 `channelScrapeRun` / `channelScrapeSnapshot` / `channelListingDailySnapshot` / `channelListingOptionDailySnapshot` 모델을 직접 만진다. 다른 도메인이 같은 패턴을 쓸 때까지는 advertising-local 로 유지.
- run lifecycle: `createRun(status:'running')` → `appendSnapshot(...)` × N → `finalizeRun(status:'complete')`. 모든 handler 가 try/catch 로 감싸 실패 시 `finalizeScrapeRunOnError(scrapeRunId, counts, err)` 로 `status:'error'` + `errorJson` 저장 — `running` 상태로 leak 금지.
- raw row 보존 우선: 매칭 실패 / 도메인 필터 (productName 짧음, missing date, unknown source) 가 있어도 row 의 `ChannelScrapeSnapshot` 은 항상 먼저 작성하고 `matchReason` 에 사유 기록. legacy AdSnapshot/Ad/TrafficStats/ItemWinner 만 그 뒤 필터 적용.
- `ListingMatch` 는 internal `optionId` 가 null 이어도 `listingOptionId` 를 반드시 보존 (C3 daily option snapshot 이 listingOption 식별자만으로 land 가능해야 함). Wave C3 부터 `externalId` / `externalOptionId` 도 함께 carry — daily snapshot 의 denormalized column 채우기용.
- KST business date: `payload.timestamp` 같은 ISO 문자열은 `+09:00` shift 후 day slice. `YYYY-MM-DD` 형태는 이미 KST business date 로 간주. helper `toBusinessDate()` 한 곳에서만 처리 — handler 가 직접 `new Date(...).slice(0,10)` 하지 말 것.
- payload date-range: extension 이 `dateFrom` / `dateTo` 를 보내면 `ExtensionSyncDto` 가 명시적으로 받아야 함 (전역 `ValidationPipe({whitelist:true})` 가 미선언 필드 strip). 받은 값은 `ChannelScrapeRun.periodStart` / `periodEnd` 로 매핑.

## Wave C5 checkpoint — Legacy consumer audit (참고)

C2/C3/C4 도입 후 legacy `AdSnapshot` / `TrafficStats` / `ItemWinner` / `Ad` consumer 를 전수 조사한 결과는 [docs/superpowers/plans/2026-04-27-channel-market-data-legacy-audit.md](../../../../docs/superpowers/plans/2026-04-27-channel-market-data-legacy-audit.md). 핵심:

- 원래 plan §7 의 C5 `ProductStrategyDaily` cache 는 optional 이며, C4 이후 반복 join latency / strategy-history 요구가 측정되지 않아 만들지 않는다.
- C4 가 strategy state evidence read path migration 을 이미 끝냈고, **이 checkpoint 에서 추가 1:1 read-path migration 은 없음**. 대부분의 legacy read 는 daily snapshot 이 들고 있지 않은 필드 (ad metric / traffic metric / wing KPI rawJson) 를 보며, `ItemWinner` status/count 처럼 daily snapshot 에 필드가 있어도 lifetime count → current/latest count 로 의미가 바뀌는 건 C6 로 defer.
- C2 raw snapshot 은 모든 payload 의 audit trail 이고, C3 daily snapshot 은 product/option state payload 에만 적용한다. `coupang_ads_daily` 같은 ad metric payload 는 legacy `AdSnapshot` + C2 raw 까지만 쓰는 게 의도다.
- C2/C3 dual-write 는 계속 필수 — legacy read 가 다 빠지기 전엔 write 도 못 뺀다.
- 더 강한 최종 방향: daily channel facts 가 product/listing/day source-of-truth 이다. 기간별(7d/14d/month/custom) 값은 daily fact 의 `SUM`/ratio recompute 로 계산하고, period source table 을 새로 만들지 않는다. 상세 방향은 [docs/superpowers/plans/2026-04-27-channel-market-data-daily-facts-source-of-truth.md](../../../../docs/superpowers/plans/2026-04-27-channel-market-data-daily-facts-source-of-truth.md).
- 구현 방향은 hard rewrite 로 확정: compatibility 병행이 아니라 daily fact source-of-truth 를 만들고 legacy market-data pipeline 을 대체한다. 상세 구현 계약은 [docs/superpowers/plans/2026-04-27-channel-market-data-c6-current-state-rewire.md](../../../../docs/superpowers/plans/2026-04-27-channel-market-data-c6-current-state-rewire.md).
- C6 대상: `getExtensionStatus` 의 `ItemWinner.groupBy` / `AdSnapshot.count`, `ad-action.listActions` 의 latest snapshot summary, `ad-collect.getStatus` 의 `AdSnapshot.findFirst+count`.
- C6 원칙: winner/status/count 는 latest `ChannelListingDailySnapshot` / `ChannelScrapeRun` / `ChannelScrapeSnapshot` 기준으로 계산한다. legacy lifetime count 나 legacy `AdSnapshot` count fallback 으로 사용자-visible status 를 되살리지 않는다.
- `Ad` / `TrafficStats` / metric-bearing `AdSnapshot` / `ItemWinner` 는 최종 sunset 대상이다. 같은 grain/의미의 daily fact 와 read rewrite 가 같은 branch 에서 완성되면 Prisma 모델과 legacy code 삭제를 허용한다. 삭제 전 consumer search, 테스트, RLS/ERD/Graphify 갱신은 필수.
- 새 모델/서비스가 이 도메인에 들어오면 audit doc 의 inventory 표를 갱신할 것.

## Wave C4 — Channel state signals on strategy reads (영구 규칙)

C3 가 만든 daily fact 를 strategy/recommendation 응답 시 함께 노출. 자동 액션 / threshold 변경은 일절 없음 — read-only evidence layer.

- `AdStrategyService.loadStrategyContext` 가 listing hydrate 후 `loadChannelStateByListing(companyId, listings)` 로 latest `ChannelListingDailySnapshot` (per listing) + latest `ChannelListingOptionDailySnapshot` (hydrate 가 선택한 deterministic primary `ChannelListingOption.id`: `createdAt` → `externalOptionId` → `id`) 을 fetch 해 `Map<listingId, ChannelStateSignal>` 로 hydrate. cross-domain coupling 없음 — `PrismaService` 직접 사용 (channels namespace service 인젝션 금지 규칙 유지).
- `AdGradeRulesService.calcActions` 가 `channelStateByListing` 을 옵션 input 으로 받아 결과 `AdStrategyAction` 의 `channelState` 필드에 attach. snapshot 부재 listing 은 `channelState: null` (없으면 reason 도 그대로 — pre-C4 와 동일).
- adverse signal (offer-winner lost / exposure 또는 sale 상태가 'active' 가 아님 / `primaryOption.stockQty === 0`) 일 때만 reason 끝에 ` · <fragment> · (YYYY-MM-DD 관측)` evidence 추가. benign state 는 reason 무변경 — diff 로 인한 noise 최소화.
- shared schema: `AdStrategyAction.channelState?: ChannelStateSignal | null` (선택 필드 — 구버전 client 와 호환). `ChannelStateSignal` / `ChannelOptionStateSignal` 은 `packages/shared/src/schemas/ads.ts` 에서 정의.
- Frontend (`apps/web/src/app/ad-ops/components/StrategyContent.tsx`) 는 `ChannelStateChips` 로 채널/관측일/winner/노출/판매/옵션재고 chip 을 expanded 카드 안에 표시. 자동 동작 변경 없음.
- AdAction 5 rule (campaign / keyword threshold) 은 그대로 — C4 는 reason text + read field 만 추가.

## Wave C3 — Daily listing/option snapshot upsert (영구 규칙)

raw `ChannelScrapeSnapshot` 다음 단계로, **관측된 product/option 상태를 일별 fact 로 정규화** 한다. raw row 는 그대로 append-only, daily fact 는 idempotent upsert.

- helper: 같은 `ChannelScrapePersistenceService` 가 `upsertListingDaily(input)` / `upsertOptionDaily(input)` 노출. `(companyId, listingId, businessDate)` / `(companyId, listingOptionId, businessDate)` 복합 unique 로 upsert.
- create path: `sampleCount = 1`, `firstObservedAt = lastObservedAt = now`, observable field set, `rawSnapshotId` link.
- update path: `sampleCount: { increment: 1 }`, `lastObservedAt = now`, `rawSnapshotId` 는 최신 관측 row 로 갱신, `firstObservedAt` 은 보존. observable field 는 caller 가 explicit non-null 일 때만 overwrite (later scrape 가 빠뜨린 field 를 wipe 하지 않음).
- 현재 daily fact 발생 source: **wing item-winner row 만**. (handleRawScrape 의 `source === 'wing'` 분기). 이유: 현 payload 중 product/option **상태** 필드 (productName / isWinner / myPrice / winnerPrice) 가 들어오는 곳이 wing 뿐. traffic 은 metric 만, ad_campaign / coupang_ads_daily 는 광고 metric 이라 daily snapshot 에 land 할 product state 가 없다 — 향후 product state 가 추가되면 normalizer 함수 (`normalizeWingListingState` / `normalizeWingOptionState` 패턴) 만 추가하고 같은 upsert helper 재사용.
- listing-only match (vendorItemId miss → externalId fallback) 는 listing daily 만 land. option daily 는 `match.listingOptionId !== null` 일 때만.
- option daily 는 internal `optionId === null` 이어도 land (`listingOptionId` 만으로 충분).
- 관측 가능한 field 가 하나도 없으면 (빈 row) normalizer 가 `null` 반환 → upsert 자체 skip. 빈 row 가 sampleCount 만 올리지 않게 한다.
- legacy `AdSnapshot` / `TrafficStats` / `ItemWinner` / `Ad` write 는 변경 없이 유지. daily snapshot 은 strategy/dashboard read model 이 향후 join 할 단일 source — C4 에서 사용.

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
AdSnapshot (raw 스크래핑 데이터, pageType=campaign|keyword|product, level=campaign|product|null)
    ↓ ad-strategy 5 규칙 평가
AdAction (실행 대기 큐, targetType: campaign|keyword)
    ↓ execution-worker lease
ExecutionTask (처리 중인 작업)
    ↓ 완료 시
ExecutionLog (감사 로그)
```

## AdAction 규칙 (snapshot-level 5 규칙, port from legacy)

| Rule | 조건 | actionType | targetType | priority |
|---|---|---|---|---|
| 1 | stock=0 AND campaign AND dailyBudget>0 | change_daily_budget | campaign | urgent (proposedValue=3000) |
| 2 | keyword AND (zero conversion AND spend≥5000 OR roas∈(0,100)) | pause_keyword | keyword | A=high / else urgent |
| 3 | keyword AND roas∈[100,200) | change_bid | keyword | profit<0 ? high : medium (bid*0.85) |
| 4 | campaign AND grade=A AND roas≥480 | change_daily_budget | campaign | high (budget*1.2) |
| 5 | campaign AND (grade=C OR roas<100) AND dailyBudget>3000 | change_daily_budget | campaign | C=high / else medium (max(3000, budget*0.5)) |

Rule 1 은 `snapshot.optionId` null 일 때 skip (listing-level snapshot 은 option stock 판정 불가).

Threshold (5000 / 100/200/480 / 0.85 / 1.2 / 0.5 / 3000) 는 현재 하드코딩. 추후 `BusinessRule` 이관은 Plan B2c 후속.

## targetType 값

`services/types.ts` 의 `AD_ACTION_TARGET_TYPES = ['campaign', 'keyword'] as const` 사용 (Plan B2c 의 execution worker dispatch 기준).

## ADR-0006 준수

- 모든 service 메서드는 `companyId: string` 을 **마지막 파라미터** 로 받음
- `getDefaultCompanyId()` / `prisma.company.findFirst({isActive:true})` 금지
- IDOR 방지: GET/PATCH/DELETE 단일 리소스 접근 시 `findFirst({id, companyId})`

## Matching 우선순위 불변

`ad-sync.buildListingMap` 의 2-tier lookup 은 이 도메인의 정의상 invariant. 멀티채널 확장 (네이버 / 11번가) 시 platform 별 externalIdMap 분리 필요.

## 참고

- 모델 스펙: [`prisma/models/advertising.prisma`](../../../../prisma/models/advertising.prisma)
- 3-layer 책임 분리 규칙: [`apps/server/src/products/CLAUDE.md`](../products/CLAUDE.md)
- Plan B2b spec: [docs/superpowers/specs/2026-04-18-plan-b2b-advertising-listing-migration-design.md](../../../../docs/superpowers/specs/2026-04-18-plan-b2b-advertising-listing-migration-design.md)
