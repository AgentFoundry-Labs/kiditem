# Project Research Summary

**Project:** KidItem — 쿠팡 운영 데이터 통합 대시보드
**Domain:** 이커머스 셀러 운영 자동화 (주문/반품/상품 데이터 통합)
**Researched:** 2026-03-25
**Confidence:** HIGH

## Executive Summary

이번 마일스톤의 핵심 과제는 "API passthrough" 구조를 "DB-native" 구조로 교체하는 것이다. 현재 orders/returns 도메인은 쿠팡 WING API를 직접 호출하고 JSON 파일을 fallback으로 쓰는 구조여서 PostgreSQL에 데이터가 전혀 적재되지 않는다. API 키가 없는 상황에서 실질적인 운영 대시보드를 만들려면 `data/` 폴더의 JSON 파일(298건 주문, 20건 반품, 1,131개 상품)을 Prisma 스키마에 한 번 임포트하고, 이후 모든 UI는 DB에서 읽는 구조로 전환해야 한다.

권장 접근법은 4단계 순차 빌드다. 먼저 Prisma 스키마를 쿠팡 원본 구조(shipmentBox → orderItems 계층)에 맞게 재설계하고, 시드 스크립트로 JSON을 DB에 적재한 뒤, NestJS 서비스를 DB 쿼리 기반으로 재작성하고, 마지막으로 프론트엔드 대시보드를 완성한다. 기존 코드베이스에 Next.js, NestJS, Prisma, recharts, TanStack Table 등 필요한 라이브러리가 대부분 이미 설치되어 있어 신규 의존성 추가는 최소화된다.

가장 큰 위험은 스키마 재설계가 기존 서비스 4개(dashboard, inventory, products, reviews)를 컴파일 에러로 동시에 깨뜨린다는 점이다. BigInt 직렬화 에러와 KST/UTC 타임존 혼재도 Phase 1에서 반드시 예방해야 하는 패턴이다. 이 세 가지 기술적 함정은 모두 스키마 재설계 단계에서 명시적으로 처리하면 이후 단계에서 추가 비용이 없다.

---

## Key Findings

### Recommended Stack

기존 프로젝트에 이미 Next.js 14, NestJS 11, PostgreSQL + Prisma 7.5, recharts 3.8, date-fns 4.1, zustand 5, Tailwind CSS 3.4, lucide-react가 설치되어 있다. 추가로 필요한 패키지는 두 개뿐이다: 테이블 정렬/필터/페이지네이션을 위한 `@tanstack/react-table ^8.21.3`과 쿠팡 KST 타임스탬프 변환을 위한 `date-fns-tz ^3.2.0`. JSON 임포트 레이어 검증용으로 `zod ^4.3.6`도 권장하나 선택적이다.

**Core technologies:**
- `@tanstack/react-table ^8.21.3`: 주문/반품 목록 정렬·필터·페이지네이션 — 헤드리스라 Tailwind와 충돌 없음, 기존 패턴과 일치
- `date-fns-tz ^3.2.0`: 쿠팡 KST implicit 타임스탬프 → UTC 변환 — 이미 설치된 date-fns ^4.x와 호환
- `zod ^4.3.6`: seed.ts JSON 임포트 시 필드 누락/타입 불일치 방어 — null 혼재 쿠팡 데이터에 필수적
- `recharts ^3.8` (기존): 반품 사유 분포 PieChart, 주문 상태별 BarChart — 재설치 불필요

**What NOT to add:** AG Grid(오버엔지니어링), moment.js(유지보수 종료), react-query(기존 useEffect+fetch 패턴과 불일치), Python 임포터(tsx 기반 시드 패턴 이미 확립).

### Expected Features

현재 orders/returns 페이지는 UI만 존재하고 DB 연동이 없는 상태다. 이번 마일스톤에서 빌드할 핵심 기능은 DB 기반 데이터 적재와 그 위의 운영 대시보드다.

**Must have (table stakes — v1):**
- DB 스키마 재설계 (Order/OrderItem/Return/ReturnItem/ProductOption/ProductImage) — 모든 기능의 전제조건
- JSON 시드 스크립트 (`prisma/seed-coupang.ts`) — 298건 주문 + 20건 반품 적재
- 주문 대시보드: 상태별 탭 + 건수 요약 + 날짜 필터 (기존 UI를 DB 기반으로 교체)
- 주문 상세 페이지: 주문자/수취인/아이템/금액 정보 (신규)
- 반품 대시보드: 목록 + 사유 + 책임 구분 (VENDOR 18/20건이 중요 인사이트)
- 반품 귀책 요약 메트릭: VENDOR vs CUSTOMER 분리 건수/비용
- 상품 상세 강화: options[], images[], 배송정책 (기존 상품 상세 페이지 확장)

**Should have (v1.x — 코어 완성 후):**
- 반품 사유 트렌드 차트 (더 많은 달 데이터 적재 시)
- 주문 볼륨 추이 스파크라인
- ActivityEvent 시스템 연동 (주문/반품 이벤트를 상품 Object View에 표시)
- 주문 아이템에서 상품 상세 링크

**Defer (v2+):**
- 실시간 쿠팡 API 연동 (API 키 미확보)
- 정산(settlement) 대시보드 (데이터 파일 비어있음)
- 교환(exchange) 관리 (데이터 파일 비어있음)

**Anti-features to avoid:** 반품 자동 승인(귀책 판단 필요), 복잡한 히트맵/코호트 분석(20건 반품으로 통계 무의미), 멀티벤더 UI 분기(companyId는 이미 스키마에 있음 — UI 변경 불필요).

### Architecture Approach

기존 "쿠팡 API passthrough" 구조에서 벗어나 PostgreSQL을 single source of truth로 전환한다. 핵심 변경은 orders/returns 서비스가 쿠팡 API 대신 Prisma 쿼리로 데이터를 읽도록 전면 재작성하는 것이다. 신규 모델 6개(OrderItem, Return, ReturnItem, Category, ProductOption, ProductImage)를 추가하고, 기존 Order 모델은 쿠팡 shipmentBox 계층에 맞게 재설계한다. 일회성 임포트는 기존 seed.ts와 분리된 `prisma/seed-coupang.ts`로 수행한다.

**Major components:**
1. `prisma/schema.prisma` — 전체 DB 스키마 source of truth. Order 재설계 + 신규 6개 모델
2. `prisma/seed-coupang.ts` — JSON → DB 일회성 임포트. upsert 패턴으로 멱등성 보장
3. `apps/server/src/orders/` — OrdersService 전면 재작성 (Prisma DB 쿼리 기반)
4. `apps/server/src/returns/` — ReturnsService 전면 재작성 + groupBy 통계 집계 포함
5. `apps/server/src/products/` — findOne 확장 (options/images/category include)
6. `apps/web/src/app/orders/[id]/` — 신규 주문 상세 페이지
7. `apps/web/src/app/returns/` — 기존 페이지 타입 수정 + 통계 카드 추가

**데이터 플로우 핵심 패턴:**
- 임포트: `Object.values(json)` → upsert by 쿠팡 원본 ID → 배치 createMany for 아이템
- 런타임: GET /api/orders → Prisma findMany with include → camelCase JSON 응답
- 통계: ReturnsService에서 Prisma groupBy로 서버 측 집계 (프론트 계산 금지)

### Critical Pitfalls

1. **BigInt 직렬화 에러** — 쿠팡 ID(returnDeliveryId = 19자리)를 Prisma BigInt 타입으로 선언하면 NestJS API 응답에서 `TypeError: Do not know how to serialize a BigInt` 런타임 에러 발생. 예방: 스키마에서 `shipmentBoxId`, `orderId`, `returnDeliveryId` 모두 `String` 타입으로 선언. `BigInt(id).toString()` 변환 후 저장.

2. **기존 서비스 컴파일 에러 연쇄** — Order 모델 재설계 시 dashboard, inventory, products, reviews 4개 서비스가 `Property 'productId' does not exist on type 'Order'` 에러로 동시에 깨짐. 예방: 스키마 변경 직후 `npx tsc --noEmit` 실행, 에러 목록 확인 후 4개 파일의 groupBy를 `orderItem` 테이블 참조로 교체.

3. **KST 9시간 오차** — 쿠팡 API 타임스탬프 `"2026-03-23T13:59:41"`은 KST implicit. Docker 컨테이너(UTC 환경)에서 `new Date(str)` 파싱 시 9시간 오차 발생. 예방: 모든 날짜 파싱에 `parseKST()` 헬퍼 사용 — `new Date(str + "+09:00")`, 빈 문자열은 null 반환.

4. **db:push 데이터 손실** — Order 모델 재설계는 파괴적 변경이라 `db:push` 시 orders 테이블 DROP 위험. Product/Company 데이터가 CASCADE로 지워질 수 있음. 예방: push 전 `DELETE FROM orders;` 명시적 실행, `--force-reset` 사용 금지.

5. **1,131개 상품 개별 INSERT 타임아웃** — 루프 내 개별 `prisma.product.create()` 패턴은 5분+ 실행 또는 트랜잭션 타임아웃. 예방: `createMany({ data: [...], skipDuplicates: true })` 배치 삽입, 헤더 배치 후 아이템 배치 2단계 패턴.

---

## Implications for Roadmap

연구 결과가 명확히 제시하는 빌드 순서는 스키마 → 임포트 → 백엔드 → 프론트엔드의 4단계다. 단계 간 강한 의존성이 있어 병렬화가 제한적이다. 모든 pitfall의 예방 시점이 Phase 1(스키마+임포트)에 집중되어 있어 이 단계의 완성도가 전체 마일스톤 품질을 결정한다.

### Phase 1: Foundation — DB 스키마 재설계 + JSON 임포트

**Rationale:** 모든 기능의 전제조건. 스키마가 없으면 어떤 서비스도, 어떤 UI도 빌드할 수 없다. 가장 많은 pitfall이 이 단계에 집중되어 있어 충분한 시간과 검증이 필요하다.

**Delivers:**
- 재설계된 Prisma 스키마 (Order 재설계 + 6개 신규 모델)
- 작동하는 `prisma/seed-coupang.ts` (멱등성 보장, KST 처리, 배치 삽입)
- 깨진 기존 서비스 4개 수정 (TypeScript 컴파일 통과)

**Addresses:** DB schema redesign, JSON seed script (FEATURES.md P1 기능 2개)

**Avoids:**
- BigInt 직렬화 에러 — String 타입으로 쿠팡 ID 저장
- 기존 서비스 컴파일 에러 — tsc --noEmit 검증 후 4개 파일 수정
- db:push 데이터 손실 — 명시적 DELETE 후 push
- KST 9시간 오차 — parseKST() 헬퍼 전면 사용
- N+1 INSERT 타임아웃 — createMany 배치 삽입

**Verification gate:** `npx tsc --noEmit` 에러 0개 + `SELECT COUNT(*) FROM orders` = 298 + `curl /api/orders` 200 응답

### Phase 2: 주문 대시보드 (Order Dashboard)

**Rationale:** 셀러의 핵심 일일 워크플로우. Phase 1의 DB가 완성되면 기존 UI 코드를 새 응답 구조에 맞게 수정하고 상세 페이지를 신규 추가하는 상대적으로 낮은 복잡도 작업이다.

**Delivers:**
- DB 기반 주문 목록 (상태별 탭, 건수 요약, 날짜 필터)
- 주문 상세 페이지 (`/orders/[id]` — 신규)
- TanStack Table 기반 정렬/페이지네이션

**Uses:** `@tanstack/react-table` (신규), `date-fns-tz` toZonedTime for 표시

**Implements:** OrdersService DB 쿼리 재작성 + OrdersController GET /:id 추가

**Avoids:**
- 금액 raw 숫자 표시 → formatKRW() 사용
- 주문 시간 UTC 표시 → toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })

### Phase 3: 반품 대시보드 (Returns Dashboard)

**Rationale:** 실제 데이터에서 90%(18/20건)가 VENDOR 귀책으로 즉각적인 재무적 인사이트가 있다. 반품 귀책 요약은 단순하면서도 비즈니스 임팩트가 큰 기능이다.

**Delivers:**
- DB 기반 반품 목록 (사유, 귀책 구분, 상태)
- VENDOR vs CUSTOMER 귀책 요약 메트릭 카드
- 반품 사유 분포 요약 (cancelReasonCategory1 기준)
- 서버 측 groupBy 통계 (ReturnsService에서 집계)

**Uses:** recharts PieChart/BarChart (기존), Prisma groupBy

**Implements:** ReturnsService 전면 재작성 + stats 응답 포함

**Avoids:**
- 반품 사유 영문 코드 표시 → reasonCodeText 한글 표시
- VENDOR/CUSTOMER 영문 표시 → "셀러 책임" / "고객 책임" 한글 변환
- 프론트 통계 계산 → 서버 집계 응답 사용

### Phase 4: 상품 상세 강화 (Product Detail Enhancement)

**Rationale:** Phase 2, 3과 독립적으로 진행 가능하지만 Phase 1의 스키마(ProductOption, ProductImage)가 완성되어야 한다. 기존 `/products/[id]` 페이지 확장이므로 신규 페이지 없이 구현 가능.

**Delivers:**
- 상품 옵션 목록 (`items[]` with 가격, 옵션명)
- 상품 이미지 갤러리 (`images[]` with CDN URL)
- 배송 정책 표시 (deliveryChargeType, returnCharge 등)

**Implements:** ProductsService findOne 확장 (options/images/category include)

### Phase Ordering Rationale

- **Phase 1이 모든 것의 블로커:** FEATURES.md의 Feature Dependencies 다이어그램이 DB Schema Redesign을 최상위 노드로 명시
- **Phase 2, 3, 4는 Phase 1 완료 후 병렬 가능:** 각각 독립 NestJS 모듈을 수정하며 서로 의존하지 않음
- **Phase 2가 Phase 3보다 우선:** 주문이 셀러 일일 워크플로우의 핵심; 반품은 주문과 연결되어 있어 주문 상세 경로가 먼저 있으면 더 자연스러운 UX
- **피트폴 집중 구조:** 6개 critical pitfall 중 5개가 Phase 1에 집중. Phase 1의 검증 게이트를 철저히 통과하면 이후 단계는 상대적으로 안전

### Research Flags

Phases with standard patterns (skip research-phase):
- **Phase 2 (주문 대시보드):** TanStack Table + Prisma findMany 패턴이 잘 문서화되어 있음. 기존 orders 서비스 파일 구조도 확립됨.
- **Phase 3 (반품 대시보드):** Prisma groupBy + recharts PieChart 패턴 표준적. 반품 비즈니스 로직이 단순(귀책 구분 2가지, 사유 코드 목록).
- **Phase 4 (상품 상세):** 기존 페이지 확장. include 패턴만 추가.

Phases likely needing careful attention (not external research, but thorough internal validation):
- **Phase 1 (스키마+임포트):** 기존 코드와의 충돌 포인트가 많음. tsc --noEmit 실행과 시드 멱등성 검증이 필수. `coupang_orders_raw.json`이 Array가 아닌 객체(`{0: ..., 1: ...}`)임을 반드시 확인.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | npm registry 직접 확인, 기존 package.json 직접 분석, 버전 호환성 교차 검증됨 |
| Features | HIGH | 실제 data/ JSON 파일 직접 검사로 필드명/구조 확인, 기존 코드베이스 분석 |
| Architecture | HIGH | 기존 코드베이스 직접 분석 + Coupang Open API 구조 교차 검증 |
| Pitfalls | HIGH | 실제 코드 직접 검사, Node.js BigInt 에러 실제 재현, coupang_orders_raw.json 구조 직접 확인 |

**Overall confidence:** HIGH

### Gaps to Address

- **쿠팡 ID 타입 불일치 (Architecture vs Pitfalls):** ARCHITECTURE.md는 `shipmentBoxId`를 `BigInt` Prisma 타입으로 제안하지만, PITFALLS.md는 NestJS 직렬화 에러를 피하기 위해 `String` 저장을 강력 권고함. **결론: String 저장 채택.** 쿠팡 ID가 MAX_SAFE_INTEGER 미만이더라도 returnDeliveryId(19자리)의 경우 String만이 안전하고, 일관성을 위해 모든 쿠팡 원본 ID를 String으로 통일한다.

- **Product-Order 연결 매핑:** `orderItems[].sellerProductId`와 내부 Product UUID 간 매핑이 항상 1:1이 아님. `OrderItem.productId`는 nullable로 두고 임포트 후 별도 매칭 작업을 v1.x에서 처리. MVP에서는 미연결 상태도 허용.

- **`coupang_orders_raw.json` 구조:** 파일이 배열이 아닌 객체(`{0: ..., 1: ...}`) 형태임. 시드 스크립트에서 `Object.values()` 처리 필수. 이를 놓치면 조용히 빈 데이터가 적재됨.

---

## Sources

### Primary (HIGH confidence — 직접 분석)
- `data/coupang_orders_raw.json` — 298건, shipmentBox 구조, KST implicit timestamp, 객체({0:...}) 형태 확인
- `data/coupang_returns_all.json` — 20건, faultByType VENDOR 18/20, receiptId 기준
- `prisma/schema.prisma` — 현재 Order 모델 구조, 의존 관계
- `apps/server/src/dashboard/dashboard.service.ts`, `inventory/`, `products/`, `reviews/` — Order 모델 의존 코드 확인
- `apps/web/package.json` — 설치된 라이브러리 버전 직접 확인
- npm registry (2026-03-25) — @tanstack/react-table@8.21.3, date-fns-tz@3.2.0, zod@4.3.6

### Secondary (MEDIUM confidence)
- [Coupang Open API — PO list query](https://developers.coupangcorp.com/hc/en-us/articles/360033919573) — 403으로 직접 접근 불가, 필드명은 기존 코드에서 교차 검증
- [Coupang Open API — Return/Cancellation Request List Query](https://developers.coupangcorp.com/hc/en-us/articles/360033919613) — faultByType 필드명 검색 결과로 확인

### Tertiary (기존 도메인 패턴 참조)
- [Shopify OMS Features 2026](https://www.shopify.com/enterprise/blog/order-management-system-oms) — 이커머스 OMS 표준 기능 패턴
- [쿠팡 WING 판매자센터 가이드](https://oscsnm.com/coupang-wing-seller-guide/) — UX 패턴 참조

---
*Research completed: 2026-03-25*
*Ready for roadmap: yes*
