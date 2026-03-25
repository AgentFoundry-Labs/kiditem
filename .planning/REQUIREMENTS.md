# Requirements: KidItem

**Defined:** 2026-03-25
**Core Value:** 셀러가 쿠팡 운영 데이터(주문, 반품, 상품)를 한 곳에서 보고 의사결정할 수 있어야 한다

## v1.0 Requirements

Requirements for milestone v1.0 — 쿠팡 운영 데이터 통합. Each maps to roadmap phases.

### 스키마 (Schema)

- [ ] **SCHM-01**: 쿠팡 주문 데이터를 shipmentBox → orderItems 계층 구조로 저장할 수 있다
- [ ] **SCHM-02**: 쿠팡 반품 데이터를 return → returnItems 계층 구조로 저장할 수 있다
- [ ] **SCHM-03**: 상품 상세 정보(옵션, 이미지, 배송정책)를 저장할 수 있다
- [ ] **SCHM-04**: 쿠팡 ID(shipmentBoxId, orderId 등 대형 숫자)를 데이터 손실 없이 저장할 수 있다
- [ ] **SCHM-05**: 기존 Order 의존 서비스(dashboard, inventory, products, reviews)가 스키마 변경 후에도 정상 동작한다

### 데이터 임포트 (Import)

- [ ] **IMPT-01**: data/ 폴더의 쿠팡 주문 JSON(298건)을 DB에 임포트할 수 있다
- [ ] **IMPT-02**: data/ 폴더의 쿠팡 반품 JSON(20건)을 DB에 임포트할 수 있다
- [ ] **IMPT-03**: data/ 폴더의 쿠팡 상품 상세 JSON(200건)을 DB에 임포트할 수 있다
- [ ] **IMPT-04**: 쿠팡 타임스탬프(KST, timezone offset 없음)를 UTC로 정확하게 변환하여 저장할 수 있다
- [ ] **IMPT-05**: 임포트 스크립트를 반복 실행해도 중복 없이 멱등하게 동작한다

### 주문 대시보드 (Order Dashboard)

- [ ] **ORDR-01**: 셀러가 주문 목록을 배송 상태별 탭으로 조회할 수 있다 (ACCEPT/INSTRUCT/DEPARTURE/DELIVERING/FINAL_DELIVERY)
- [ ] **ORDR-02**: 셀러가 각 상태별 주문 건수를 한눈에 확인할 수 있다
- [ ] **ORDR-03**: 셀러가 날짜 범위를 지정하여 주문을 필터링할 수 있다
- [ ] **ORDR-04**: 셀러가 주문 상세를 열어 주문자/수신자/아이템/가격/할인/배송 정보를 확인할 수 있다
- [ ] **ORDR-05**: 셀러가 주문 상세에서 택배사와 송장번호를 확인할 수 있다

### 반품 대시보드 (Return Dashboard)

- [ ] **RETN-01**: 셀러가 반품 목록을 조회할 수 있다 (상태, 사유, 책임구분 포함)
- [ ] **RETN-02**: 셀러가 반품 사유별 분포를 차트로 확인할 수 있다 (오배송, 단순변심, 상품불량 등)
- [ ] **RETN-03**: 셀러가 책임 구분(VENDOR/CUSTOMER) 비율을 한눈에 확인할 수 있다
- [ ] **RETN-04**: 셀러가 반품 상세를 열어 반품 아이템, 배송 정보, 사유를 확인할 수 있다

### 상품 상세 강화 (Product Enhancement)

- [ ] **PROD-01**: 셀러가 상품 상세 페이지에서 옵션 목록(itemName, salePrice, originalPrice)을 확인할 수 있다
- [ ] **PROD-02**: 셀러가 상품 상세 페이지에서 상품 이미지 갤러리를 확인할 수 있다
- [ ] **PROD-03**: 셀러가 상품 상세 페이지에서 배송 정책(배송비 유형, 무료배송 기준, 반품 배송비)을 확인할 수 있다

## v1.x Requirements

Deferred to after validation. Tracked but not in current roadmap.

### 분석 강화

- **ANLT-01**: 셀러가 반품 사유 트렌드를 월별 차트로 확인할 수 있다
- **ANLT-02**: 셀러가 일별/주별 주문량 추이를 확인할 수 있다
- **ANLT-03**: 주문/반품 이벤트가 ActivityEvent 시스템과 연동되어 상품 Object View에 표시된다

### 카테고리

- **CATG-01**: 셀러가 상품의 카테고리별 필수/선택 속성 입력 상태를 확인할 수 있다

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 쿠팡 API 실시간 연동 | API 키 미보유 |
| 정산(Settlement) 대시보드 | 데이터 비어있음 (coupang_settlements_raw.json = []) |
| 교환(Exchange) 대시보드 | 데이터 비어있음 (coupang_exchanges.json = []) |
| 반품 자동 승인 | 셀러 판단 필요 (귀책 구분, 물류), 자동화는 비용 리스크 |
| 재고 자동 업데이트 (반품 시) | 반품 거부/파손 가능성 있어 수동 판단 필요 |
| 복잡한 데이터 시각화 (히트맵, 코호트) | 298주문/20반품은 통계적 의미 없는 규모 |
| 멀티벤더 UI | 단일 벤더(거영)만 사용, companyId는 이미 스키마에 존재 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 | — | Pending |
| SCHM-02 | — | Pending |
| SCHM-03 | — | Pending |
| SCHM-04 | — | Pending |
| SCHM-05 | — | Pending |
| IMPT-01 | — | Pending |
| IMPT-02 | — | Pending |
| IMPT-03 | — | Pending |
| IMPT-04 | — | Pending |
| IMPT-05 | — | Pending |
| ORDR-01 | — | Pending |
| ORDR-02 | — | Pending |
| ORDR-03 | — | Pending |
| ORDR-04 | — | Pending |
| ORDR-05 | — | Pending |
| RETN-01 | — | Pending |
| RETN-02 | — | Pending |
| RETN-03 | — | Pending |
| RETN-04 | — | Pending |
| PROD-01 | — | Pending |
| PROD-02 | — | Pending |
| PROD-03 | — | Pending |

**Coverage:**
- v1.0 requirements: 22 total
- Mapped to phases: 0
- Unmapped: 22 ⚠️

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 after initial definition*
