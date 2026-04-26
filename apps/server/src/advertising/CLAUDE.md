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
  ↳ matchListingFromRow 우선순위:
      1) Coupang vendorItemId → ChannelListingOption.externalOptionId → {listingId, optionId}
      2) externalId → ChannelListing.externalId + platform='coupang' → {listingId, optionId: null}
      3) 매칭 실패 → AdSnapshot 만 저장 (listingId=null, rawJson)
  ↓ AdSnapshot / Ad / TrafficStats upsert (listingId null 이면 Ad/TrafficStats skip)
  ↓ ad-strategy.calcActions listing 단위 aggregate
  ↓ AdAction create (targetType: 'campaign' | 'keyword')
  ↓ execution-worker lease → markRunning → markDone/markFailed
  ↓ ExecutionLog 감사
```

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
