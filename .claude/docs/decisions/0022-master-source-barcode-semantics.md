---
id: 0022
title: Master source barcode semantics
status: Accepted
date: 2026-04-26
supersedes: []
superseded-by: null
affects:
  - prisma
  - apps/server
  - apps/server/src/products
  - apps/web
  - packages/shared
---

## Context

`kiditem_list` 워크북의 `자사상품코드` 컬럼은 EAN/source barcode 의미로, 같은 값이 여러 옵션 row 에 걸쳐 반복된다. 1,906 row 중 86개 그룹이 중복된 자사상품코드를 공유하고, 일부는 한 EAN 이 두 개 이상의 product family(상품명) 에 걸친다 (대표 케이스: `8806384882841` — 2개의 product 가 같은 EAN, 각 4 옵션). 기존 baseline import 는 이 source 값을 `ProductOption.barcode` 에 그대로 기록했고, 옵션 단위 unique constraint `product_options_company_barcode_active` 가 이를 거부해 import crash 가 났다.

ADR-0013 은 `ProductOption` 을 "물리 SKU, 바코드 1:1, 재고/매입/창고 단위" 로 정의했다. 옵션/스캐너 단위 barcode 의 unique 의미는 inventory/order/ad 도메인 전반에서 의존한다 (`/options/by-barcode/:barcode` single-result 등). 이 의미를 약화시키면 안 된다.

동시에 source EAN/family 단위 barcode 는 표시·검색·import idempotency 측면에서 master 레이어에서 다뤄야 정직하다. 이를 위한 별도 필드가 필요하다.

## Decision

`MasterProduct` 에 **non-unique** `barcode` (nullable) 를 추가한다.

- `MasterProduct.barcode` = source barcode/EAN. 검색·표시 가능. `(companyId, barcode)` 는 **unique 가 아니라 index 만**. 한 EAN 이 여러 master 에 걸칠 수 있음을 데이터 그대로 보존한다.
- `ProductOption.barcode` = 진짜 옵션/스캐너 단위 barcode. ADR-0013 의 unique 의미는 그대로 유지된다. baseline import 는 이 필드를 절대 source EAN 으로 채우지 않는다 (null 로 남긴다).
- baseline import 의 master 식별자는 `(source barcode or blank fallback, normalized product name)` 결정적 키이며, `MasterProduct.legacyCode` 에 `kiditem:v1:<sha256-16chars>` 형태(prefix 포함 27 자, `CreateMasterDto.legacyCode` max 100 미만)로 저장한다. 이 키는 idempotency 전용 — UI 의 "user-facing 상품 코드" 로 노출 금지. 그 자리는 기존 `MasterProduct.code` (master_code_seq 기반 `M-XXXXXXXX`) 가 담당한다.
- option 식별자는 `(companyId, ProductOption.legacyCode = 상품코드)` 의 active partial unique 를 그대로 활용한다.
- Wing 데이터 매칭은 exact-only 로만 연결한다: option-legacy 가 unique 하면 그 옵션이 속한 master 에, 아니면 source barcode 가 정확히 한 master 에 매핑될 때만 fallback. ambiguous/unmatched 는 reports 로만 남기고 silent link 금지.

## Consequences

**Positive**

- 워크북의 1,906 row 가 silent collapse 없이 import 된다.
- `8806384882841` 같은 hard case 가 두 master(같은 EAN, 다른 이름) + 4+4 옵션으로 정직하게 표현된다.
- `ProductOption.barcode` unique semantics 가 inventory/order/ad consumer 측에서 그대로 유효하다.
- source EAN 이 catalog list/detail/search 에서 명확히 master 필드로 노출되며, 옵션 SKU/legacyCode/option barcode 와 시각적으로 분리된다.
- import idempotency 가 `MasterProduct.legacyCode` 의 partial unique active index 위에서 동작한다 (재실행 시 재생성 X, 갱신만).

**Negative / tradeoffs**

- `MasterProduct.barcode` 검색은 다중 결과를 반환할 수 있으며, API consumer 가 `findUnique` 가정을 하면 안 된다.
- `MasterProduct.legacyCode` 가 import group key 로 overload 된다. 미래에 다른 source 가 들어오면 `kiditem:v1:` prefix 가 충돌 회피 역할을 하며, 필요 시 `sourceGroupKey` 같은 별도 필드를 후속 ADR 로 도입할 수 있다.
- 워크북의 `자사상품코드` 가 진짜 옵션 단위 barcode 인 시나리오가 등장하면 별도 source-specific path 가 필요하다 — 그 source 만 `ProductOption.barcode` 에 채우는 별도 import script 로 분리한다.

**Operational constraints**

- baseline import 의 grouping/Wing 매칭은 모두 `scripts/import-baseline-planner.ts` 의 순수 helper 안에서만 결정한다. `scripts/__tests__/import-baseline-planner.spec.ts` 가 hard case (`8806384882841`, blank-barcode 비-collapse, ambiguous Wing 차단) 를 가드한다.
- Prisma model / shared schema / 카탈로그 서비스를 수정한 뒤에는 `npm run db:erd` + `npm run graphify:schema` 로 navigation 산출물을 갱신한다 (ADR-0021).
- `/products` UI 는 master `barcode` 와 option `legacyCode`/`barcode` 를 시각적으로 구분해서 표시한다. EAN 값을 옵션명/SKU 처럼 노출 금지.

## Related

- ADR-0013 — Product schema 3-layer redesign (이 결정의 master/option 책임 분리 기반).
- ADR-0021 — Generated schema navigation graphs (변경 후 ERD/Graphify 재생성 규칙).
- `scripts/import-baseline-planner.ts` — 결정의 순수 planner.
- `scripts/import-product-baseline.ts` — Prisma writer (planner 의 plan 만 적용).
- `prisma/3layer-setup.sql` — `product_options_company_barcode_active` partial unique (option barcode unique 유지 조건).
