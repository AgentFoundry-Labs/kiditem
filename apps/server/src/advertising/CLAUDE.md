# advertising — Ad Operations

광고 관리 도메인. Dashboard → Kiditem 이식 완료.

## Structure

- **Controller**: `advertising.controller.ts` — all `/api/ads/*` routes
- **Services**: advertising (list), ad-campaigns (snapshots/trends), ad-strategy (rules/plan/recommend), ad-benchmark (diagnosis), ad-collect (status), ad-sync (extension sync)
- **Frontend**: `apps/web/src/app/ads/` — 5 pages (main, campaigns, strategy, benchmark, collect)
- **DB**: `Ad`, `AdCampaignSnapshot`, `AdProductSnapshot`, `AdSnapshot`, `ItemWinner`, `ScrapeTarget` models (Prisma)
- **Shared**: `@kiditem/shared/schemas` — `AdsListItem`, `AdBenchmarkData`, `AdTrendsData`, `AdStrategyPlan`, `AdRulesData`
- **Data source**: Chrome 익스텐션 (`extensions/coupang-ads-scraper/`) → NestJS sync API → DB
- **Extension**: `extensions/coupang-ads-scraper/` — 광고센터 + Wing 자동 수집

## API Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /api/ads` | 상품별 광고 현황 리스트 |
| `GET /api/ads/campaigns` | 캠페인 스냅샷 (period 필터) |
| `GET /api/ads/campaigns/trends` | 일별 트렌드 + 전후반 비교 + ABC 예산 분배 |
| `GET /api/ads/strategy/rules` | ABC 등급별 규칙/추천 (실시간 계산, 에이전트 미의존) |
| `GET /api/ads/strategy/plan` | 주간 액션 플랜 |
| `GET /api/ads/strategy/recommend` | AI 전략 추천 카드 |
| `GET /api/ads/benchmark` | 업계 평균 대비 진단 |
| `POST /api/ads/collect` | 데이터 수집 (→ 익스텐션 안내) |
| `GET /api/ads/collect/status` | 수집 상태 확인 |
| `POST /api/ads/extension/sync` | 익스텐션 데이터 수신 (ad_campaign, raw_scrape, traffic) |
| `GET /api/ads/extension/status` | 익스텐션 연결 상태 |
| `GET /api/ads/scrape-targets` | 스크래핑 대상 URL 목록 |
| `POST /api/ads/scrape-targets` | 스크래핑 대상 생성/markScraped |
| `DELETE /api/ads/scrape-targets/:id` | 스크래핑 대상 비활성화 |

## 주요 변경사항

- `GET /api/ads`: `products` + `summary` (gradeSpend, tierSpend, gradeSpendPercent) 반환. 응답에 `items`와 `products` 둘 다 포함.
- `GET /api/ads/strategy/rules`: 에이전트 결과 의존 → **실시간 계산** 전환. DB에서 직접 Ad+Product 조회 후 ABC 등급별 규칙 엔진 적용.
- `GET /api/ads/extension/status`: `wing.kpis` (Wing 대시보드 KPI 카드 데이터) 포함.
- `calcAdIssues()`: 상품별 배열 → 카운트 객체 `{ zeroConversion, lowRoas, cGradeHighTier, aGradeNoAd }` 반환.
