# Plan B2b.refactor — Ad Strategy Service Split (Design Spec v2)

> **Status**: Draft v2 — architect review 반영 (APPROVED with 2 mandatory amendments)
> **Session**: 2026-04-19
> **Predecessors**: [Plan B2b spec](2026-04-18-plan-b2b-advertising-listing-migration-design.md), [PR #30](https://github.com/AgentFoundry-Labs/kiditem/pull/30)
> **Branch**: `feat/plan-b2b-refactor-ad-strategy` (from `origin/main` @ `2c17850`)

## v1 → v2 Amendments

1. **Prisma extraction inventory (Section 3.3 신규)** — calc 메서드 5개의 embedded Prisma 호출 13건을 명시. orchestrator 가 fetch 흡수 후 plain data 전달. "line 그대로 이전" 표현 부정확이라 정정.
2. **util pattern 정당화 (Section 4.3)** — channels/adapters 유사 분석 잘못. 분석 제거하고 "explicit dependency, mock 가능, NestJS DI 우회 정당화" 자체 근거로 교체.
3. **integration test 갱신 (Section 5.4 추가)** — `ad-strategy-flow.pg.integration.spec.ts:110-117` 의 service constructor 주입에 4 sub-service 추가 명시.

---

## 1. Goal

`apps/server/src/advertising/services/ad-strategy.service.ts` (post-port LOC 1410, Plan B2b 의 split trigger 1400 충족) 을 **orchestrator + 4 pure-calculator sub-service + 1 util module** 로 분할한다. 동작 변경 없음 — `apps/web/src/app/ad-ops/` consumer 와 `advertising.controller.ts` 의 6 endpoint 응답 shape 은 byte-identical. E2E 동등성은 기존 `ad-strategy-flow.pg.integration.spec.ts` 12 시나리오로 보증.

핵심 결정: sub-service 들은 **Prisma 의존 없는 pure calculator** (orchestrator 가 모든 데이터 fetch 후 plain object 로 전달). 예외: `ad-recommend.service.ts` 만 `AgentRegistryService` 주입 (agent 호출 필요).

## 2. Why now

apps/server/CLAUDE.md "1000+ LOC service 는 도메인 관점으로 service 쪼개는 것" 규칙. Plan B2b 완료 시점 LOC 측정 결과 1410 → split trigger Mandatory. Plan B2b retrospective 에 follow-up 으로 명시됨 (PR #30 body). 미루면 Plan B2c / B3 의 cross-domain 작업 시 ad-strategy 가 큰 단일 파일이라 cross-cutting refactor 가 누적되며 유지보수 부담 증가.

## 3. In-Scope / Out-of-Scope

### 3.1 In-scope files

| Path | 작업 |
|---|---|
| `apps/server/src/advertising/services/ad-strategy.service.ts` | **Rewrite** (1410 LOC → 목표 < 400 LOC). Orchestrator. 6 public method (getRules / getWeeklyPlan / getAiEnhancedPlan / getRecommendations / getExposureAnalysis / registerCampaign) 만 유지. constructor 에 `PrismaService + AdConfigService + AgentRegistryService` 외 4 sub-service 추가 주입. 데이터 fetch + sub-service 호출 + 응답 shape 조립만. 모든 `calc*` / `calculate*` / `determineTopIssue` / `enhanceActionsWithAi` / `ruleToActionType` 제거 (sub-service 로 이동). `getCurrentPeriod` / `getWeekRange` / `hydrateListings` / `getInventorySnapshot` 은 util 로 이동. |
| `apps/server/src/advertising/services/ad-grade-rules.service.ts` | **Create**. `@Injectable()` class. **Prisma 의존 없음**. Public method: `calcActions(input: GradeRulesInput): AdStrategyAction[]`, `calcAdIssues(input: AdIssuesInput): AdIssues`. Private helper: `ruleToActionType(rule)`. Input 타입 (`GradeRulesInput`, `AdIssuesInput`) 은 `services/types.ts` 에 신규. **fetch 분리 필수**: 기존 `calcActions` 의 본문 (line 653-941) 은 그대로 이전 가능. **`calcAdIssues` 는 line 959 의 `prisma.ad.groupBy` + line 969 의 `hydrateListings` 호출을 orchestrator 가 사전 fetch 후 input 으로 주입하는 형태로 변환 필요**. 동작 결과 동일. |
| `apps/server/src/advertising/services/ad-budget-allocator.service.ts` | **Create**. `@Injectable()` class. **Prisma 의존 없음**. Public method: `calcBudgetAllocation(input)`, `calcTierAnalysis(input)`, `calcSnapshotKeyMetrics(input)`, `calcTop20(input)`. Input 타입은 types.ts 에 신규. **fetch 분리 필수**: 4 메서드 모두 Prisma 호출이 인라인되어 있음 — orchestrator 가 사전 fetch 후 input 주입. 자세한 fetch 매핑은 Section 3.3 참조. |
| `apps/server/src/advertising/services/ad-exposure.service.ts` | **Create**. `@Injectable()` class. **Prisma 의존 없음**. Public method: `calculateScores(input: ScoreInput): ExposureProductScore`, `determineTopIssue(input: TopIssueInput): string \| null`, `assembleExposureData(scores, urgentActions): ExposureAnalysisData`. 기존 line 199-373 (getExposureAnalysis 의 계산 부분) + 1218-1308 (5 calculate*Score) + 1308-1410 (determineTopIssue) 이전. orchestrator 의 `getExposureAnalysis` 는 데이터 fetch 후 listing 별로 `calculateScores` 호출 + `assembleExposureData` 마무리. |
| `apps/server/src/advertising/services/ad-recommend.service.ts` | **Create**. `@Injectable()` class. **Hybrid — `AgentRegistryService` 주입 허용** (sub-service 중 유일). Public method: `enhanceActionsWithAi(actions: AdStrategyAction[], companyId: string): Promise<AdStrategyAction[]>`, `getLatestAgentRecommendation(companyId: string): Promise<AdStrategyRecommendation[]>`. 기존 line 1150-1218 (enhanceActionsWithAi) + 180-199 (getRecommendations 의 agent 조회 부분) 이전. orchestrator 의 `getRecommendations` 는 thin wrapper. |
| `apps/server/src/advertising/services/util/ad-strategy-helpers.ts` | **Create**. **Pure functions module** (class 아님). Export: `getCurrentPeriod(): {year: number, month: number}`, `getWeekRange(period: '7d' \| '14d' \| 'month'): {start: string, end: string}`, `hydrateListings(prisma: PrismaService, companyId: string, listingIds: string[]): Promise<HydratedListing[]>`, `getInventorySnapshot(prisma: PrismaService, companyId: string, listingIds: string[]): Promise<Map<string, InventoryRow>>`. 기존 line 452-518 (getCurrentPeriod / getWeekRange / hydrateListings / getInventorySnapshot) 이전. PrismaService 는 첫 파라미터로 명시 (DI 아님). |
| `apps/server/src/advertising/services/types.ts` | **Modify**. 신규 input/output 타입 추가: `GradeRulesInput`, `AdIssuesInput`, `BudgetAllocatorInput`, `TierAnalysisInput`, `Top20Input`, `KeyMetricsInput`, `ExposureScoreInput` (기존 `ScoreInput` 확장 또는 alias), `TopIssueInput`, `RecommendInput`, `HydratedListing`, `InventoryRow`. 기존 export (`AD_ACTION_TARGET_TYPES`, `LISTING_SUMMARY_SELECT`, `GradeBudgetAllocation`, `ScoreInput`, `ListingMetricsRow`) 유지. |
| `apps/server/src/advertising/advertising.module.ts` | **Modify**. providers 배열에 `AdGradeRulesService`, `AdBudgetAllocatorService`, `AdExposureService`, `AdRecommendService` 추가. exports 변경 없음 (internal). |
| `apps/server/src/advertising/services/__tests__/ad-grade-rules.spec.ts` | **Create**. Pure unit test (vi.fn() mock 없음, plain input). 시나리오: rule 별 trigger 조건 boundary (zero-conv 5000 경계, roas 100/200/480 경계, stock=0, optionId null skip, grade A/B/C 분기). |
| `apps/server/src/advertising/services/__tests__/ad-budget-allocator.spec.ts` | **Create**. Pure unit. 시나리오: 등급별 예산 분배 비율, tier aggregate (no listings → empty), Top20 ordering (spend desc + tie-break), keyMetrics sum/avg. |
| `apps/server/src/advertising/services/__tests__/ad-exposure.spec.ts` | **Create**. Pure unit. 시나리오: 5 score 경계값 (sales/review/ad/fulfillment/info 각각), determineTopIssue 우선순위 (worst score → topIssue), assembleExposureData (urgent threshold). |
| `apps/server/src/advertising/services/__tests__/ad-recommend.spec.ts` | **Create**. Unit (`AgentRegistryService` mock). 시나리오: enhanceActionsWithAi 성공 (agent 결과 merge) / agent 실패 (원본 반환) / 빈 actions input. |
| `apps/server/src/advertising/services/__tests__/ad-strategy.spec.ts` | **Modify (대폭 축소)**. 기존 20 tests 중 mock-heavy (Prisma 호출 매개변수 검증) 대부분 삭제. 5-10 thin delegation test 만 유지: orchestrator 가 4 sub-service 를 올바른 순서/파라미터로 호출하는지 (vi.fn mock for 4 sub-service). 또는 전체 drop 도 수용 (integration 으로 충분 시). |
| `apps/server/src/advertising/services/__tests__/util/ad-strategy-helpers.spec.ts` | **Create (선택)**. Pure util — getCurrentPeriod / getWeekRange 만 단위 테스트 (1-2 tests). hydrate/inventory 는 integration 에서 검증 (Prisma 의존). |

### 3.3 Prisma extraction inventory (v2 추가)

기존 `ad-strategy.service.ts` 의 5 calc 메서드는 **Prisma 호출과 계산이 혼재**. sub-service 가 pure calculator 가 되려면 Prisma 호출 13건을 orchestrator 로 이동해야 함. 매핑:

| 원래 메서드 (현재 line) | 인라인 Prisma 호출 | orchestrator 가 사전 fetch 후 sub-service input 으로 주입 |
|---|---|---|
| `calcSnapshotKeyMetrics` (557-607) | line 566: `prisma.adSnapshot.findMany({where: {companyId, level: 'campaign', period}})` | `snapshots: AdSnapshot[]` |
| `calcBudgetAllocation` (609-651) | line 612: `adConfigService.getConfig(companyId)`<br>line 614: `prisma.ad.groupBy({by: ['listingId'], _sum, where: {companyId, date: gte}})`<br>line 624: `prisma.channelListing.findMany({where: {id: {in: listingIds}}, select: LISTING_SUMMARY_SELECT})` | `config: AdsConfig`<br>`adGroups: AdAggregateRow[]`<br>`listings: HydratedListing[]` |
| `calcAdIssues` (955-1026) | line 959: `prisma.ad.groupBy({by: ['listingId'], _sum, where: {companyId, date: gte}})`<br>line 969: `this.hydrateListings(companyId, listingIds)` (또 prisma.channelListing.findMany 내부 호출) | `adGroups: AdAggregateRow[]`<br>`listings: HydratedListing[]` |
| `calcTierAnalysis` (1028-1065) | line 1029: `prisma.masterProduct.findMany({where: {companyId, isDeleted: false}, select: {id, abcGrade, ...}})`<br>line 1049: **N+1 loop** `prisma.ad.aggregate({where: {companyId, listing: {masterId: {in: tierMasterIds}}, date: gte}})` per tier | `masters: MasterTierRow[]`<br>`tierAggregates: Map<string, AdAggregate>` (orchestrator 가 N+1 → 단일 `groupBy` 또는 unstack 으로 사전 집계) |
| `calcTop20` (1067-1144) | line 1072: `prisma.profitLoss.findMany({where: {companyId, year, month}})`<br>line 1085: `prisma.channelListing.findMany({where: {companyId, isDeleted: false}, select: {..., masterProduct: {abcGrade}}})`<br>line 1102: `prisma.ad.groupBy({by: ['listingId'], _sum, where: {companyId, date: gte}})` | `profitLosses: ProfitLoss[]`<br>`listings: HydratedListing[] (with abcGrade)`<br>`adGroups: AdAggregateRow[]` |

**N+1 처리 (calcTierAnalysis line 1049)**: 현재 tier 별 loop 으로 N 회 aggregate. orchestrator 가 단일 `prisma.ad.groupBy({by: ['listingId'], _sum, where: {companyId, date: gte}})` + master 의 abcGrade 로 in-memory tier roll-up. 결과 동일, 쿼리 1회로 축소. 부수 효과: Top20 의 line 1102 와 query 결과 공유 가능 — orchestrator 가 한 번 fetch 후 calcBudgetAllocation/calcAdIssues/calcTierAnalysis/calcTop20 모두에 전달.

**오케스트레이터 absorbed query 카운트**:
- `prisma.adSnapshot.findMany` × 1 (calcSnapshotKeyMetrics)
- `prisma.ad.groupBy` × 1 (calcBudget+calcAdIssues+calcTierAnalysis+calcTop20 공유)
- `prisma.channelListing.findMany` × 1 (with abcGrade for tier roll-up)
- `prisma.masterProduct.findMany` × 0 (channelListing.include.masterProduct 로 흡수)
- `prisma.profitLoss.findMany` × 1 (calcTop20)
- `adConfigService.getConfig` × 1

→ 6 fetch in `Promise.all([...])` 1회로 통합. 기존 N+1 자동 해소.

### 3.4 ad-recommend / ad-exposure 의 Prisma 의존

| 원래 메서드 | Prisma 호출 | sub-service 처리 |
|---|---|---|
| `getRecommendations` (line 180-197) | `prisma.agentTask.findFirst({where: {agentType:'ad_strategy', companyId}, orderBy:{createdAt:'desc'}})` | **ad-recommend.service.ts** 가 `prisma` 주입 받지 않고 `AgentRegistryService` 만 주입. agent task 조회는 `agentRegistry` API 에 위임 가능 (또는 orchestrator 가 fetch). 후자 선호. |
| `getExposureAnalysis` (line 199-371) | line 199-265 내 `prisma.adSnapshot.findMany`, `prisma.ad.groupBy`, `prisma.channelListing.findMany`, `prisma.profitLoss.findMany`, `prisma.review.groupBy` — 5 fetch | orchestrator 가 사전 fetch. `ad-exposure.service.ts` 는 listing 별 score 계산 + topIssue 만 (pure). |

### 3.2 Out-of-scope

| Item | 이유 |
|---|---|
| 동작 변경 (응답 shape / threshold / 계산 로직) | Pure refactor 정의 위반. `ad-strategy-flow.pg.integration.spec.ts` 12 시나리오로 동등성 검증 |
| 다른 ad-* service (ad-benchmark, ad-campaigns, ad-sync, ad-action) | 단일 service 분할만. 다른 service 도 분할 필요 시 별도 plan |
| Prisma schema | 변경 없음 |
| Frontend (apps/web) | 무관 |
| Repository extraction (`AdRepository`) | Plan B2b.repo follow-up. 본 plan 에서 다루지 않음 |
| Ad rule threshold 의 BusinessRule 이관 | 하드코딩 유지 (B2c 후속) |
| ad-strategy.spec.ts 의 통합 테스트 → split spec migration 의 test name change | best-effort. 핵심은 sub-service unit + integration |

## 4. Architecture

### 4.1 Data flow

```
Request (controller @CurrentCompany)
    ↓
AdStrategyService.getWeeklyPlan(period, companyId)   [orchestrator, < 400 LOC]
    ├── const {year, month} = helpers.getCurrentPeriod()
    ├── const {listings, snapshots, ads, orders} = await Promise.all([
    │       this.prisma.adSnapshot.findMany({where:{companyId, ...}}),
    │       this.prisma.ad.groupBy({by:['listingId'], _sum:{...}, where:{companyId, date:{gte:...}}}),
    │       helpers.hydrateListings(this.prisma, companyId, listingIds),
    │       helpers.getInventorySnapshot(this.prisma, companyId, listingIds),
    │       this.prisma.review.groupBy({by:['listingId'], _avg:{rating}, where:{companyId}}),
    │   ])
    ├── const gradeMap = this.adBudgetAllocator.calcSnapshotKeyMetrics({listings, snapshots, ads}).gradeMap
    ├── const actions = this.adGradeRules.calcActions({snapshots, listings, gradeMap, inventory})
    ├── const issues = this.adGradeRules.calcAdIssues({snapshots, gradeMap})
    ├── const tierAnalysis = this.adBudgetAllocator.calcTierAnalysis({listings, ads})
    ├── const top20 = this.adBudgetAllocator.calcTop20({listings, ads})
    └── return { actions, issues, tierAnalysis, top20, week: helpers.getWeekRange(period) }
```

각 public method 는 동일 패턴: **fetch (Promise.all) → sub-service 계산 호출 → shape 조립**.

### 4.2 Boundary discipline

**sub-service Prisma 의존 0** (ad-recommend 제외):
- `ad-grade-rules.service.ts` constructor: `constructor() {}` — 의존성 없음
- `ad-budget-allocator.service.ts` constructor: `constructor() {}` — 의존성 없음
- `ad-exposure.service.ts` constructor: `constructor() {}` — 의존성 없음
- `ad-recommend.service.ts` constructor: `constructor(private readonly agentRegistry: AgentRegistryService) {}` — agent 호출 필요

**Why this matters**: pure calculator 는 (1) test 가 plain input 이라 단순, (2) refactor 시 deps 추적 단순, (3) calcActions 같은 무거운 로직이 DB 호출 안 하므로 의도치 않은 N+1 불가능.

### 4.3 Helper module (pure functions)

`util/ad-strategy-helpers.ts` 는 class 아닌 functions:
- `getCurrentPeriod(now?: Date): {year, month}` — pure (Date 인자 옵션, 기본 `new Date()`)
- `getWeekRange(period): {start, end}` — pure (string in/out)
- `hydrateListings(prisma, companyId, listingIds): Promise<HydratedListing[]>` — Prisma 첫 인자, function call
- `getInventorySnapshot(prisma, companyId, listingIds): Promise<Map<string, InventoryRow>>` — 동일

**NestJS DI 우회 정당화** (v2 정정):
- channels/adapters 비교 분석 잘못 — 그쪽은 HTTP client wrapper 이지 Prisma-as-arg 패턴 아님. 분석 폐기.
- 정당화 자체 근거: (1) **explicit dependency** — Prisma 가 명시 인자라 함수 시그니처만 봐도 의존 명확. (2) **mock-친화적** — unit test 에서 mock prisma 객체 전달 단순. (3) **stateless 헬퍼는 service overhead 불필요** — `@Injectable()` class + DI registration 의 비용보다 함수가 가벼움. (4) **orchestrator 가 own Prisma 인스턴스를 명시 전달** — DI 의존성 흐름 추적 단순.
- 단, util 내부 다른 helper 가 service 형태로 진화하면 이 패턴 복습. 본 plan 의 4 함수만 한정 적용.

### 4.4 Module registration

```ts
// advertising.module.ts (modify)
@Module({
  controllers: [AdvertisingController],
  providers: [
    AdvertisingService,
    AdCampaignsService,
    AdStrategyService,           // orchestrator (existing)
    AdBenchmarkService,
    AdCollectService,
    AdSyncService,
    AdActionService,
    AdExecutionService,
    AdConfigService,
    // 신규 4 sub-service
    AdGradeRulesService,
    AdBudgetAllocatorService,
    AdExposureService,
    AdRecommendService,
  ],
  // exports 변경 없음
})
export class AdvertisingModule {}
```

## 5. Testing

### 5.1 New unit specs (4)

각 sub-service 별 pure-input unit spec. Prisma mock 불필요. vi.fn() 없음 (ad-recommend 제외 — agent mock 필요).

| File | 시나리오 |
|---|---|
| `ad-grade-rules.spec.ts` | Rule 1 (stock=0 + campaign + budget>0) trigger / skip when optionId null / Rule 2 (keyword zero-conv spend≥5000) / Rule 2 (keyword roas∈(0,100)) / Rule 3 (keyword roas∈[100,200) bid 하향) / Rule 4 (campaign A grade roas≥480 budget 확대) / Rule 5 (campaign C grade or roas<100 + budget>3000 축소) / calcAdIssues 카테고리화 |
| `ad-budget-allocator.spec.ts` | calcSnapshotKeyMetrics sum/avg (empty / single / multi listing) / calcBudgetAllocation 등급별 비율 + delta / calcTierAnalysis tier groupBy + roas null / calcTop20 spend desc + tie-break (revenue desc) + take 20 |
| `ad-exposure.spec.ts` | 5 score 각 경계값 (예: salesScore t14Rev>maxT14 → 100, t14Rev=0 → 0) / determineTopIssue worst score 우선순위 / assembleExposureData urgent threshold (score < N → urgentActions) |
| `ad-recommend.spec.ts` | enhanceActionsWithAi success (agent 결과 merge into actions) / agent 실패 (원본 actions 그대로 반환) / 빈 actions[] input → 빈 반환 / getLatestAgentRecommendation 최신 1건 조회 |

### 5.2 Modified spec

| File | 변경 |
|---|---|
| `ad-strategy.spec.ts` | 기존 20 tests 중 ~15 drop (Prisma mock 호출 매개변수 검증). 5 thin delegation test 만 유지 (4 sub-service 호출 순서 + 매개변수). 또는 전체 drop 도 수용 (integration 이 충분) |

### 5.3 Unchanged

| File | 이유 |
|---|---|
| `ad-strategy-flow.pg.integration.spec.ts` (12 tests) | 동작 동등성 보증의 핵심. shape 변경 없으니 그대로 PASS 해야 함. **회귀 detection 의 main signal**. |
| 기타 ad-*.spec.ts 다른 service | 변경 없음 |

### 5.4 Integration test setup 갱신 (v2 추가)

`apps/server/src/advertising/__tests__/ad-strategy-flow.pg.integration.spec.ts:110-117` 의 service constructor 호출:

```ts
// 기존 (B2b)
const service = new AdStrategyService(prisma, adConfig, agentRegistry);

// 신규 (B2b.refactor) — 4 sub-service 주입 추가
const adGradeRules = new AdGradeRulesService();
const adBudgetAllocator = new AdBudgetAllocatorService();
const adExposure = new AdExposureService();
const adRecommend = new AdRecommendService(agentRegistry);
const service = new AdStrategyService(
  prisma,
  adConfig,
  agentRegistry,
  adGradeRules,
  adBudgetAllocator,
  adExposure,
  adRecommend,
);
```

기존 12 시나리오 코드 변경 없음. setup 만 갱신 — 응답 shape 비교 그대로 PASS 해야 함 (refactor 동등성 보증).

### 5.5 Verification command

```bash
cd apps/server && npx vitest run src/advertising/                      # all unit + e2e
npm run test:integration -- ad-strategy-flow                            # E2E equivalence (12 tests)
wc -l apps/server/src/advertising/services/ad-strategy.service.ts       # < 400 LOC
```

## 6. ADR Impact

**없음**. 단일 service 내부 refactor. ADR-0006 / ADR-0013 / ADR-0014 / ADR-0015 모두 영향 없음. apps/server/CLAUDE.md 의 "1000+ LOC service 분할" 규칙 준수가 동기.

## 7. 위험 / 완화

| 위험 | 완화 |
|---|---|
| sub-service input 타입을 잘못 정의 → orchestrator 가 잘못된 데이터 전달 | types.ts 에 명시. tsc 가 컴파일 시점에 mismatch 잡음 |
| pure calculator refactor 중 계산 결과 미세 변경 (예: 부동소수점, sort tie-break) | integration test 의 12 시나리오 응답 shape 비교로 catch. 추가로 unit spec 의 boundary value 가 drift 잡음 |
| ad-recommend hybrid (AgentRegistryService 주입) → "pure" 일관성 깨짐 | "ad-recommend 만 예외" 명시. 다른 sub-service 의 컨벤션 침범 막음 (lint/grep 으로 sub-service 의 PrismaService import 0 hit 확인) |
| orchestrator 가 너무 두꺼워짐 (목표 < 400 미달성) | 6 public method 가 각 60-80 LOC + 30 LOC overhead 면 ≈ 400. 초과 시 helper 추가 분리 검토 |
| ad-strategy.spec.ts 의 기존 20 test 가 mock-heavy 라 sub-service 분할 후 호환성 깨짐 | 의도된 작업 — drop 또는 thin delegation 으로 재편성. 회귀는 4 sub-service unit + integration 이 보호 |
| advertising.module.ts 의 4 신규 provider 등록 누락 | implementer task step 에 module 수정 명시. dev:server 부팅 검증 (advertising module DI) 으로 catch |
| util/ad-strategy-helpers.ts 의 Prisma 첫 인자 패턴이 다른 도메인에서 혼동 유발 | comment + JSDoc 으로 의도 명시. channels/adapters 패턴과 일치 |

## 8. 완료 기준

1. `wc -l apps/server/src/advertising/services/ad-strategy.service.ts` → **< 400 LOC**
2. `cd apps/server && npx tsc --noEmit` 에서 `src/advertising/` **0 errors**
3. `npx vitest run src/advertising/` **all unit PASS** (신규 4 sub-spec + thin orchestrator spec + 기존 ad-* spec)
4. `npm run test:integration -- ad-strategy-flow` **12/12 PASS** (동작 동등성)
5. `grep -rn 'this\.prisma\|PrismaService' apps/server/src/advertising/services/ad-grade-rules.service.ts apps/server/src/advertising/services/ad-budget-allocator.service.ts apps/server/src/advertising/services/ad-exposure.service.ts` → **0 hits** (pure calculator invariant)
6. `npm run start:dev` advertising module 부팅 성공 (DI 배선 검증)
7. PR body 에 follow-up "ad-strategy.refactor 완료" 표기

## 9. Team Workflow

순수 refactor 라 spec 이탈 위험 작음. **subagent-driven-development** 패턴 (single implementer agent + lead 직접 review) 으로 빠르게 진행. TeamCreate 4 teammates 오버헤드 불필요.

| 단계 | 방식 |
|---|---|
| Spec | 이 문서 + architect 1 reviewer (light) |
| Plan | 1 reviewer (plan-eng-review skill) |
| Execute | superpowers:subagent-driven-development — implementer subagent 가 task 1개씩 실행 후 lead 가 commit 검토 |
| QA | integration test 가 main signal. 별도 qa-verifier 불필요 |

## 10. Follow-ups

- **Plan B2b.repo** (후속 — 별도 plan): `AdRepository` 추출 여부 재평가. sub-service split 후 시점에 다시 측정.
- **Plan B2c**: ad-strategy 분할이 끝나면 다른 fat service 식별 (dashboard 등) 의 분할 고려.
- **Plan B3**: 하드코딩 thresholds (5000/100/200/480 등) 의 BusinessRule 이관 — 본 plan 범위 밖.

## 11. Open Questions (v2 에서 대부분 resolve)

- ~~sub-service 데이터 접근 방식~~ → **Resolved**: Option B (orchestrator fetches, pure calculators)
- ~~ad-recommend 의 AgentRegistry 주입 예외~~ → **Resolved**: hybrid 명시
- ~~calcSnapshotKeyMetrics 위치~~ → **Resolved**: budget-allocator 가 출처. orchestrator 가 호출 후 결과 (gradeMap) 를 grade-rules 에도 전달.
- ~~ad-strategy.spec.ts 의 운명~~ → **Resolved**: 5 thin delegation 유지 (배선 회귀 detection).
- ~~Prisma 호출 13건 처리~~ → **Resolved (v2)**: Section 3.3 explicit inventory + Promise.all 6 fetch 통합으로 N+1 해소.
- ~~util 패턴 정당화~~ → **Resolved (v2)**: 자체 근거 (Section 4.3) 로 교체. channels/adapters 분석 폐기.
