# Roadmap: KidItem v1.0

**Milestone:** v1.0 — 쿠팡 운영 데이터 통합
**Created:** 2026-03-25
**Granularity:** Standard (4 phases)
**Coverage:** 22/22 requirements mapped

---

## Phases

- [ ] **Phase 1: Foundation** - DB 스키마 재설계 + JSON 데이터 임포트
- [ ] **Phase 2: Order Dashboard** - 주문 목록/상세 대시보드
- [ ] **Phase 3: Return Dashboard** - 반품 목록/통계 대시보드
- [ ] **Phase 4: Product Enhancement** - 상품 상세 정보 강화

---

## Phase Details

### Phase 1: Foundation
**Goal**: 쿠팡 원본 데이터 구조에 맞는 DB 스키마가 준비되고, 실 데이터 298건 주문/20건 반품/상품 정보가 DB에 적재된다
**Depends on**: Nothing (first phase)
**Requirements**: SCHM-01, SCHM-02, SCHM-03, SCHM-04, SCHM-05, IMPT-01, IMPT-02, IMPT-03, IMPT-04, IMPT-05
**Success Criteria** (what must be TRUE):
  1. `SELECT COUNT(*) FROM orders` 결과가 298이고, `SELECT COUNT(*) FROM returns` 결과가 20이다
  2. `curl /api/orders` 가 200 응답을 반환하고 기존 dashboard/inventory/products/reviews 서비스가 정상 동작한다
  3. `npx tsc --noEmit` 실행 시 에러가 0개다
  4. 임포트 스크립트를 두 번 반복 실행해도 레코드 수가 변하지 않는다 (멱등성)
  5. 쿠팡 19자리 ID(shipmentBoxId, returnDeliveryId 등)가 API 응답에서 문자열로 정상 직렬화된다
**Plans**: TBD

### Phase 2: Order Dashboard
**Goal**: 셀러가 쿠팡 주문 데이터를 DB에서 읽어 상태별로 조회하고 각 주문의 상세 정보를 확인할 수 있다
**Depends on**: Phase 1
**Requirements**: ORDR-01, ORDR-02, ORDR-03, ORDR-04, ORDR-05
**Success Criteria** (what must be TRUE):
  1. 셀러가 주문 목록 페이지에서 배송 상태 탭(ACCEPT/INSTRUCT/DEPARTURE/DELIVERING/FINAL_DELIVERY)을 클릭하면 해당 상태의 주문만 표시된다
  2. 셀러가 날짜 범위를 입력하면 해당 기간의 주문만 필터링되어 표시된다
  3. 각 배송 상태 탭에 주문 건수가 숫자로 표시된다
  4. 셀러가 주문 행을 클릭하면 주문자/수신자/아이템/가격/할인/배송 정보가 표시된 상세 페이지로 이동한다
  5. 주문 상세 페이지에서 택배사명과 송장번호를 확인할 수 있다
**Plans**: TBD
**UI hint**: yes

### Phase 3: Return Dashboard
**Goal**: 셀러가 반품 현황을 조회하고 사유별/귀책별 분포를 파악하여 운영 의사결정에 활용할 수 있다
**Depends on**: Phase 1
**Requirements**: RETN-01, RETN-02, RETN-03, RETN-04
**Success Criteria** (what must be TRUE):
  1. 셀러가 반품 목록 페이지에서 각 반품의 상태, 사유, 귀책 구분(셀러 책임/고객 책임)을 확인할 수 있다
  2. 셀러가 반품 사유별 분포를 차트로 확인할 수 있다 (오배송, 단순변심, 상품불량 등 카테고리별)
  3. 페이지 상단에 VENDOR/CUSTOMER 귀책 건수와 비율이 요약 카드로 표시된다
  4. 셀러가 반품 행을 클릭하면 반품 아이템, 배송 정보, 사유 상세를 확인할 수 있다
**Plans**: TBD
**UI hint**: yes

### Phase 4: Product Enhancement
**Goal**: 셀러가 기존 상품 상세 페이지에서 옵션/이미지/배송정책 정보를 확인할 수 있다
**Depends on**: Phase 1
**Requirements**: PROD-01, PROD-02, PROD-03
**Success Criteria** (what must be TRUE):
  1. 상품 상세 페이지에서 옵션 목록(옵션명, 판매가, 정상가)이 표 형태로 표시된다
  2. 상품 상세 페이지에서 상품 이미지가 갤러리 형태로 표시된다
  3. 상품 상세 페이지에서 배송비 유형, 무료배송 기준 금액, 반품 배송비가 표시된다
**Plans**: TBD
**UI hint**: yes

---

## Progress Table

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 0/? | Not started | - |
| 2. Order Dashboard | 0/? | Not started | - |
| 3. Return Dashboard | 0/? | Not started | - |
| 4. Product Enhancement | 0/? | Not started | - |

---

## Coverage

| Requirement | Phase |
|-------------|-------|
| SCHM-01 | Phase 1 |
| SCHM-02 | Phase 1 |
| SCHM-03 | Phase 1 |
| SCHM-04 | Phase 1 |
| SCHM-05 | Phase 1 |
| IMPT-01 | Phase 1 |
| IMPT-02 | Phase 1 |
| IMPT-03 | Phase 1 |
| IMPT-04 | Phase 1 |
| IMPT-05 | Phase 1 |
| ORDR-01 | Phase 2 |
| ORDR-02 | Phase 2 |
| ORDR-03 | Phase 2 |
| ORDR-04 | Phase 2 |
| ORDR-05 | Phase 2 |
| RETN-01 | Phase 3 |
| RETN-02 | Phase 3 |
| RETN-03 | Phase 3 |
| RETN-04 | Phase 3 |
| PROD-01 | Phase 4 |
| PROD-02 | Phase 4 |
| PROD-03 | Phase 4 |

**Mapped: 22/22**

---
*Created: 2026-03-25*
*Milestone: v1.0*
