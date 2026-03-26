# Requirements: KidItem

**Defined:** 2026-03-26
**Core Value:** 소싱 상품을 최소한의 수작업으로 판매 가능한 상세페이지로 변환하고, 운영 전반을 하나의 대시보드에서 관리한다.

## v2.0 Requirements

Requirements for milestone v2.0: 쿠팡 운영 대시보드

### 주문 대시보드 (ORD)

- [ ] **ORD-01**: 셀러가 상태별(ACCEPT/INSTRUCT/DELIVERY/FINAL_DELIVERY) 주문 목록을 필터링하여 조회할 수 있다
- [ ] **ORD-02**: 셀러가 총 주문 수, 상태별 건수, 총 매출을 KPI 통계 카드로 확인할 수 있다
- [ ] **ORD-03**: 셀러가 개별 주문을 클릭하여 주문자/수령자/상품 항목 상세를 볼 수 있다
- [ ] **ORD-04**: 셀러가 일별 주문량/매출 트렌드를 차트로 확인할 수 있다
- [ ] **ORD-05**: 셀러가 상품별 매출 랭킹(TOP N)을 확인할 수 있다

### 반품/교환 관리 (RET)

- [ ] **RET-01**: 셀러가 반품/교환 목록을 상태·사유별로 필터링하여 조회할 수 있다
- [ ] **RET-02**: 셀러가 반품 사유 분포를 차트(도넛/바)로 확인할 수 있다
- [ ] **RET-03**: 셀러가 CUSTOMER vs VENDOR 과실 비율을 통계로 확인할 수 있다

### 공통 인프라 (INFRA)

- [ ] **INFRA-01**: 날짜 범위 필터가 KST 기준으로 정확히 동작한다
- [ ] **INFRA-02**: 대시보드 통계 쿼리가 Promise.all로 병렬 실행된다

## Future Requirements

- 정산 데이터 조회 (수수료, 정산금 추적) — v2.1
- 문의/리뷰 관리 (SLA 추적) — v2.1
- 쿠팡 API 실시간 연동 — API 키 확보 후
- 다채널 (스마트스토어, 11번가) — 쿠팡 안정화 후

## Out of Scope

| Feature | Reason |
|---------|--------|
| 쿠팡 API 실시간 동기화 | API 키 미확보 |
| 정산 정합성 검증 | 정확한 수수료 데이터 없이 오해 유발 |
| 문의 앱내 답변 | 별도 인증 메커니즘 필요 |
| WebSocket 실시간 업데이트 | 아키텍처 부적합 |
| 모바일 앱 | 웹 우선 |

## Traceability

| REQ | Phase | Status |
|-----|-------|--------|
| ORD-01 | — | Pending |
| ORD-02 | — | Pending |
| ORD-03 | — | Pending |
| ORD-04 | — | Pending |
| ORD-05 | — | Pending |
| RET-01 | — | Pending |
| RET-02 | — | Pending |
| RET-03 | — | Pending |
| INFRA-01 | — | Pending |
| INFRA-02 | — | Pending |

## v1.0 Requirements (Completed)

All v1.0 requirements shipped. See MILESTONES.md for details.
