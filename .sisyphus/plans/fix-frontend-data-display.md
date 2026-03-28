# Fix Frontend Data Display Issues

<!-- /autoplan restore point: /Users/yhc125/.gstack/projects/AgentFoundry-Labs-kiditem/main-autoplan-restore-20260328-224059.md -->

> 25개 이슈 전수 조사 + CEO/Eng/Design 3-phase 리뷰 완료. 리뷰 결과 반영하여 플랜 전면 수정.

## Problem Statement

gstack 브라우저로 19개 페이지를 전수 조사한 결과, 상품 데이터가 프론트에 제대로 표시되지 않는 이슈 25건 발견.
대부분의 이슈는 프론트엔드 코드 문제가 아닌 **백엔드 데이터 부재** (NULL/0 값)가 원인.

### Root Causes (리뷰 반영)

1. **쿠팡 데이터 동기화 파이프라인 미구축** — ~~설정 > "동기화 기록 없음"~~ `apps/server/src/settings/` 자체가 존재하지 않음. 쿠팡 API 클라이언트(`coupang/client.ts`)와 래퍼(`coupang/products.ts`, `coupang/orders.ts`)는 있으나, **동기화 서비스/스케줄러/워크플로우 실행기가 미구현**. 워크플로우 카탈로그에 Coupang 노드 6개가 UI 정의만 있고 실행기(executor) 미등록.
2. **소싱 상품 가격 파싱 실패** — `sourcing.service.ts:21`에서 `data.price`만 체크. 1688 rawData의 `priceRange`, `offer.price`, `skuProps[].price` 등 다양한 포맷 미대응. Chrome 익스텐션 레이어 수정도 필요할 수 있음.
3. **API 성능 문제** — ~~상품 API 페이징 없음~~ 상품 API는 `paginationParams()` 이미 구현됨 (Eng 리뷰에서 확인). **광고/리뷰 서비스가 전체 테이블 스캔 3회** (in-memory join, SQL 집계 미사용).

### Null Data Taxonomy (Design 리뷰에서 추가)

프론트엔드 전체에서 null/0 데이터의 표시 규칙을 통일:

| 데이터 상태 | 표시 | 색상 | 사용 시점 |
|------------|------|------|----------|
| 필드가 null | "-" | `text-slate-400` | 파생/읽기전용 필드 (profitRate, revenue 등) |
| 가격이 null | "미설정" | `text-slate-400` | sellPrice, costPrice 등 사용자 입력 필드 |
| 가격이 실제 ₩0 | "₩0" | `text-slate-900` | 동기화로 확인된 0원 |
| 재고 미동기화 | "동기화 필요" | `text-amber-600` | currentStock=0 AND 동기화 이력 없음 |
| 재고 실제 품절 | "0개 (품절)" | `text-red-600` | currentStock=0 AND 동기화 완료 |
| 퍼센트가 null | "-" | `text-slate-400` | profitRate, adRate 등 |

## Scope

- Backend: NestJS API 수정 (동기화 파이프라인 **신규 구축**, 가격 파싱, ~~API 페이징~~ 광고/리뷰 성능)
- Frontend: 크래시 수정 + Null 분류체계 적용 + 한글 매핑 + 카테고리명 표시 + false alarm 해소
- DB: 스키마 변경 불필요 (기존 모델 활용). 기존 데이터 보정 마이그레이션 스크립트.

## Plan

### Phase 0: 크래시 수정 + False Alarm 해소 (의존성 없음, 즉시 착수)

#### 0-1. formatKRW/formatPercent 크래시 수정 + Null 분류체계 적용
- **위치**: `apps/web/src/lib/utils.ts`, 각 페이지 컴포넌트
- **우선순위**: **P0 — `formatPercent(undefined)`가 런타임 TypeError 크래시**
- **작업**:
  - `formatKRW(null|undefined)` → `"-"` 반환 (현재: `Math.round(null)` = "0" 오표시)
  - `formatPercent(null|undefined)` → `"-"` 반환 (현재: `undefined.toFixed()` = **크래시**)
  - 가격 필드(sellPrice, costPrice)에서 null → "미설정" 표시 (Null 분류체계 적용)
  - `sourcing/page.tsx`의 로컬 `formatKRW` 제거 → `utils.ts`로 통합
  - `inventory/page.tsx`에서 `formatKRW(i.currentStock)` → `formatNumber(i.currentStock)` + "개" (재고는 통화가 아님)
  - 이미지 배열 `.map()` 전 `Array.isArray()` 검증 추가
  - `JSON.parse` 호출에 try-catch 감싸기 (DetailPageEditor.tsx)
- **검증**: NULL 데이터가 있는 상품에서 페이지 크래시 0건, Null 분류체계대로 표시

#### 0-2. 동기화 미실행 vs 실제 품절 구분
- **위치**: `apps/web/src/app/inventory/page.tsx`, `apps/web/src/app/cleanup/page.tsx`
- **우선순위**: **P0 — "품절 1131개" false alarm이 유저 패닉 유발**
- **작업**:
  - 재고 페이지: `currentStock === 0 AND 동기화 이력 없음` → "동기화 필요" (amber) vs "품절" (red) 구분
  - 정리 대상: sellPrice=0 AND revenue=0인 상품에 "데이터 불완전" 배지 추가 (false positive 방지)
  - 상품 상세: 모든 MetricCard가 null일 때 빈 카드 4개 대신 "쿠팡 동기화를 실행하면 판매 데이터가 표시됩니다" 배너
  - inventory, cleanup 페이지의 `console.error` → 유저에게 에러 메시지 표시 (사일런트 실패 방지)
- **검증**: `/inventory`에서 "품절" 대신 "동기화 필요" 표시, `/cleanup`에서 미동기화 상품 구분

#### 0-3. 데이터 신선도 표시
- **위치**: 동기화 의존 페이지 헤더 영역
- **작업**: "최근 동기화: X분 전" 또는 "동기화 기록 없음 — 설정에서 동기화를 실행하세요" 표시
- **검증**: 각 페이지에서 동기화 상태 확인 가능

### Phase 1: 데이터 파이프라인 구축

#### 1-1. 쿠팡 동기화 파이프라인 **신규 구축**
- **위치**: `apps/server/src/coupang-sync/` (신규 모듈) — 기존 `coupang/client.ts`, `coupang/products.ts`, `coupang/orders.ts` 활용
- **⚠ 중요**: `apps/server/src/settings/` 존재하지 않음. 동기화 서비스를 처음부터 구축해야 함.
- **하위 태스크**:
  - **1-1a. API 키 검증 + 헬스체크** (1h) — 쿠팡 API 키가 유효한지 먼저 확인. 무효시 CSV 임포트 대안으로 전환.
  - **1-1b. 상품 동기화 서비스** (4-6h) — `getSellerProducts()` nextToken 페이징 → Product.sellPrice, commissionRate, ProductItem 매핑
  - **1-1c. 주문 동기화 서비스** (2-3h) — CoupangOrder/CoupangOrderItem 매핑
  - **1-1d. 수동 트리거 엔드포인트** (1h) — `POST /api/coupang-sync/products`, `POST /api/coupang-sync/orders`
- **검증**: `/products` 페이지에서 판매가/매출 컬럼에 실제 값 표시
- **블로커**: 쿠팡 API 키가 무효하면 CSV 임포트 엔드포인트 구축 (대안: 2-3h)
- **DB 변경**: 불필요 — Product, CoupangOrder, CoupangOrderItem, ProductItem 모델 기존 존재

#### 1-2. 소싱 상품 가격 파싱 수정
- **위치**: `apps/server/src/sourcing/sourcing.service.ts` (line 21), Chrome 익스텐션
- **작업**:
  - rawData에서 다양한 가격 포맷 대응: `data.price`, `data.priceRange` (예: "12.5-18.0" → 최저가), `data.offer.price`, `data.skuProps[].price`
  - 기존 13개 소싱 상품 rawData 실제 확인 후 costCny 재추출 마이그레이션 스크립트
  - Chrome 익스텐션 가격 스크래핑 확인 (필요시 `extensions/` 수정)
- **검증**: `/sourcing` 페이지에서 원가(CNY) 컬럼에 실제 값 표시

#### 1-3. 재고 동기화 (Phase 1-1 완료 후)
- **위치**: `apps/server/src/inventory/inventory.service.ts`, 쿠팡 재고 API
- **의존성**: Phase 1-1 인프라 필요 (coupang-sync 모듈)
- **작업**:
  - 쿠팡 재고 API 엔드포인트 추가 (`coupang/products.ts`에 미존재)
  - Inventory.currentStock 일괄 업데이트
- **검증**: `/inventory` 페이지에서 "동기화 필요" → 실제 재고 수치로 전환

### Phase 2: 프론트엔드 UX 개선

#### 2-1. 반품/교환 한글 매핑
- **위치**: `apps/web/src/app/returns/page.tsx`
- **작업**:
  - 기존 UC/RC/CC 매핑 확장 (추가 쿠팡 반품 상태 코드)
  - `cancelReason`/`cancelReasonCategory1` → 한글 사유 매핑
  - DB의 `reasonCodeText` 필드 활용 가능 여부 확인
  - 환불금액: `enclosePrice` 필드 표시 (스키마에 이미 존재)
- **검증**: `/returns` 페이지에서 반품사유 한글, 상태 한글, 환불금액 숫자 표시

#### 2-2. 카테고리 ID → 카테고리명 변환
- **위치**: `apps/web/src/app/products/[id]/page.tsx` (line 483)
- **접근**: Static JSON 매핑 (키즈 완구 카테고리 <50개로 한정)
- **작업**: "4944" → "완구 > 퍼즐" 형태 표시
- **검증**: `/products/[id]` 카테고리 필드에 한글 카테고리명 표시

#### 2-3. 정리 대상 소싱 상품 필터링
- **위치**: `apps/web/src/app/cleanup/page.tsx` 또는 `/api/products` 쿼리
- **작업**: status가 'draft'/'processing'인 소싱 상품 제외
- **검증**: `/cleanup`에서 중국어 원본 상품명 사라짐

### Phase 3: API 성능 최적화

#### ~~3-1. 상품 목록 API 페이징~~ — 삭제 (이미 구현 완료)
> Eng 리뷰에서 확인: `products.service.ts`가 `paginationParams()` 사용 중. controller도 `page`, `limit` 파라미터 수용. 추가 작업 불필요.

#### 3-1. 광고/리뷰 API 성능 수정
- **위치**: `apps/server/src/ads/ads.service.ts`, `apps/server/src/reviews/reviews.service.ts`
- **작업**:
  - 전체 테이블 스캔 3회 → Prisma 집계 쿼리 또는 raw SQL 집계로 전환
  - 페이징 추가 (`paginationParams` 패턴 재사용)
  - 날짜 필터 추가 (현재 전체 기간 로드)
- **검증**: `/ads`, `/reviews` 페이지 3초 이내 로드

#### 3-2. API 이중 호출 — 확인 후 결정
- React StrictMode dev-only 가능성 높음. Production 빌드에서 확인 후 필요시만 수정.

### Phase 4: 기타 수정

#### 4-1. SSR Hydration Mismatch 수정
- **위치**: `apps/web/src/components/layout/Header.tsx`
- **작업**: `suppressHydrationWarning` 또는 동적 스타일 제거

#### 4-2. Recharts 차트 width/height 경고
- **위치**: 대시보드 차트 컴포넌트
- **작업**: ResponsiveContainer에 minWidth/minHeight 설정

#### ~~2-4. 반품 대시보드 데이터 표시~~ — 삭제 (코드 정상, 데이터만 부재)
> Eng 리뷰에서 확인: `coupang/returns/page.tsx`에 요약 카드/차트 코드 이미 구현. `coupang-dashboard.service.ts`에 `getReturnSummary()` 등 구현. Phase 1-1 동기화 후 자동 해결.

## Priority & Effort (리뷰 반영)

| Phase | 작업 | 우선순위 | 예상 공수 | 비고 |
|-------|------|---------|----------|------|
| 0-1 | NULL 방어 + Null 분류체계 | **P0** | 2-3h | 크래시 수정 + UX 통일 |
| 0-2 | 품절 false alarm 해소 | **P0** | 1-2h | 유저 패닉 해소 |
| 0-3 | 데이터 신선도 표시 | P0 | 1h | 유저 신뢰 회복 |
| 1-1 | 쿠팡 동기화 **신규 구축** | P1 | **8-16h** | ~~2-4h~~ 리뷰 후 4배 상향 |
| 1-2 | 소싱 가격 파싱 | P1 | 2-3h | 다양한 rawData 포맷 대응 |
| 1-3 | 재고 동기화 | P1 | 2-3h | 1-1 완료 후 |
| 2-1 | 반품 한글 매핑 | P2 | 1-2h | 독립적 |
| 2-2 | 카테고리명 변환 | P2 | 1h | Static JSON 매핑 |
| 2-3 | 소싱 상품 필터 | P2 | 0.5h | 독립적 |
| 3-1 | 광고/리뷰 API 성능 | P3 | 3-4h | SQL 집계 전환 |
| 4-* | 기타 (hydration, 차트) | P3 | 1h | 낮은 영향도 |

**총 예상 공수: 24-38 시간** (기존 16-28h에서 상향)
**Phase 0만 완료해도 (4-6h): 크래시 0건 + false alarm 해소 + 전 페이지 null 안전**

### 삭제된 항목
- ~~Phase 3-1 (상품 API 페이징)~~ — 이미 구현 완료 (`paginationParams()` 사용 중)
- ~~Phase 2-4 (반품 대시보드)~~ — 코드 정상, Phase 1-1 데이터 부재만 해결하면 자동 동작

## Constraints

- 기존 아키텍처 유지 (NestJS + Next.js + Prisma)
- Native PG enum 금지 → String + validation
- 프론트 'use client' only
- API 경로 /api/{domain} 직접 매핑
- 도메인 모듈 간 직접 import 금지
- DB 스키마 변경 불필요 (기존 모델로 충분)

## Risks

1. **쿠팡 API 키 무효** — Phase 1-1a에서 즉시 확인. 무효시 CSV 임포트 대안 (2-3h)
2. **1688 rawData 구조 다양성** — 13개 상품의 실제 rawData 확인 후 파싱 전략 결정
3. **데이터 보정 범위** — active 상품만 대상 (1120개 전체가 아닌 실제 판매중인 ~50-100개)
4. **광고/리뷰 느린 원인** — 프로파일링 선행 필요 (Docker cold start vs 쿼리 문제 구분)
5. **테스트 부재** — 백엔드 서비스에 테스트 파일 없음. 동기화 필드 매핑, 가격 파싱에 최소 유닛 테스트 필요.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 1 | issues_open | Phase 1-1 미존재 모듈 참조, 공수 3-4배 과소, 대안(CSV) 미탐색. Score: 5/10 |
| Eng Review | `/plan-eng-review` | Architecture & tests | 1 | issues_open | Phase 3-1 이미 완료, Phase 2-4 phantom, formatPercent P0 크래시, 테스트 0건. Score: 6/10 |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | issues_open | Null 분류체계 부재, 품절 false alarm, 에러 삼킴 3건, 일관성 부재. Score: 3→6/10 |

**VERDICT:** 3-phase 리뷰 완료. 중대 수정 3건(1-1 재작성, 2건 삭제, P0 격상) + Design 추가 6건 반영. Phase 0부터 착수 가능.
