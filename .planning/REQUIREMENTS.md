# Requirements: KidItem

**Defined:** 2026-03-25
**Core Value:** 소싱 상품을 최소한의 수작업으로 판매 가능한 상세페이지로 변환한다.

## v1.0 Requirements

Requirements for milestone v1.0: 상세페이지 파이프라인 리팩토링

### Schema

- [x] **SCHM-01**: Product에 draftContent (JSONB) 컬럼 추가하여 Step 1 결과를 별도 저장할 수 있다
- [x] **SCHM-02**: Product에 pipelineStep (String) 컬럼 추가하여 파이프라인 진행 단계를 추적할 수 있다

### Pipeline

- [x] **PIPE-01**: 사용자가 AI 재가공 시 콘텐츠만 생성하고 (한국어 카피 + 테마 컬러), 이미지는 생성하지 않는다
- [x] **PIPE-02**: 사용자가 에디터에서 확정 후 이미지 생성을 별도 트리거할 수 있다
- [x] **PIPE-03**: 이미지 생성 시 사용자가 선택한 히어로 이미지 1장으로 배너/메인/디테일 전부 생성한다
- [x] **PIPE-04**: 기존 이미지 분류(_analyze_product) 호출을 제거하고 히어로 기반으로 전환한다
- [x] **PIPE-05**: 사이즈 차트 OCR 감지는 기존대로 유지한다
- [x] **PIPE-06**: agent_tasks.input에 확정된 데이터를 스냅샷으로 저장하여 race condition을 방지한다

### Editor

- [x] **EDIT-01**: 에디터에서 텍스트 필드를 직접 편집할 수 있다 (제목, 훅텍스트, 키포인트, 스펙 등)
- [x] **EDIT-02**: 에디터에서 테마 컬러 7개를 컬러 피커로 변경할 수 있다
- [x] **EDIT-03**: 에디터에서 raw_data.images 중 히어로 이미지를 선택할 수 있다
- [x] **EDIT-04**: 편집 내용이 실시간으로 템플릿 프리뷰에 반영된다

### API

- [x] **API-01**: PUT /api/products/:id/draft-content로 편집 내용을 저장할 수 있다
- [x] **API-02**: GET /api/products/:id/preview가 draftContent 기반으로 프리뷰를 제공한다
- [x] **API-03**: POST로 이미지 생성 단계를 트리거할 수 있다

## v2.0 Requirements

Requirements for milestone v2.0: 쿠팡 운영 대시보드

### Infrastructure

- [ ] **INFRA-01**: `kstDayStart(date: Date): Date` 헬퍼가 존재하며 모든 날짜 범위 쿼리에 적용된다. Docker UTC 환경에서 한국 주문의 날짜가 정확히 필터링된다.
- [ ] **INFRA-02**: `apps/server/src/coupang/constants.ts`가 `ORDER_STATUSES`와 `RETURN_STATUSES`를 `as const`로 export하며 모든 서비스 쿼리가 이 상수를 참조한다.

### Orders

- [x] **ORD-01**: 주문 페이지에 오늘 주문 수, 오늘 매출(원), 확인 대기 건수 KPI 바가 표시된다.
- [x] **ORD-02**: 30일 일별 매출 트렌드 라인 차트가 KST 기준으로 렌더링된다.
- [x] **ORD-03**: 상품별 매출 상위 20개 테이블이 `sellerProductId` 기준으로 집계되어 표시된다.
- [x] **ORD-04**: 사이드바에 ACCEPT 대기 주문 수와 UC 반품 수가 배지로 표시된다.
- [x] **ORD-05**: 7일/30일/90일/사용자 지정 날짜 범위 필터가 모든 주문 대시보드 쿼리에 동시 적용된다.

### Returns

- [x] **RET-01**: 반품 페이지에 반품률 KPI 카드가 표시된다 (반품 수 / 주문 수 × 100%).
- [x] **RET-02**: `cancelReasonCategory1` 기준 반품 사유 건수 막대 차트가 렌더링된다.
- [x] **RET-03**: CUSTOMER 귀책 vs VENDOR 귀책 비율 표시기가 반품 페이지에 표시된다.

## Future Requirements

### Enhancements

- **ENH-01**: 디바운스 자동 저장 (편집 중 페이지 이탈 시 데이터 보존)
- **ENH-02**: 이미지 생성 후 개별 이미지 재생성 기능
- **ENH-03**: 템플릿 변경 기능 (bold-vertical ↔ simple-vertical 전환)

### v2.x Dashboard Additions

- **SETT-01**: 정산 기간 트래커 — `CoupangSettlement` 모델 추가, 예상 정산일 카드 표시
- **INQ-01**: 고객 문의 SLA 지표 — `CoupangInquiry` 모델 추가, 응답 기한 카운트다운
- **DASH-01**: 시간대별 주문 분포 차트 (KST 기준 시간별 `EXTRACT(HOUR FROM ...)`)
- **DASH-02**: 상품별 매출 + 반품률 오버레이 테이블

## Out of Scope

| Feature | Reason |
|---------|--------|
| Oneshot 파이프라인 변경 | 템플릿 모드만 대상, oneshot은 별도 흐름 유지 |
| 새 템플릿 추가 | 파이프라인 분리에 집중, 기존 템플릿 활용 |
| 모바일 앱 | 웹 우선 |
| GrapesJS 구조화 데이터 동기화 | GrapesJS는 최종 HTML 편집용으로만 유지 |
| WebSocket 실시간 주문 push | 복잡도 대비 가치 낮음; 30초 폴링 + 새 주문 배너로 대체 |
| 대시보드 로드 시 AI 인사이트 자동 생성 | 매 페이지뷰마다 LLM 호출은 비용/지연 과다 |
| 정산 순이익 자동 정산 (수수료/환수 포함) | Coupang API 데이터 정합성 미확인 |
| 앱 내 고객 문의 답변 | Coupang Wing OAuth 필요, 기존 HMAC 인증 범위 초과 |

## Traceability

### v1.0

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 | Phase 1 | Complete |
| SCHM-02 | Phase 1 | Complete |
| PIPE-01 | Phase 2 | Complete |
| PIPE-02 | Phase 2 | Complete |
| PIPE-03 | Phase 2 | Complete |
| PIPE-04 | Phase 2 | Complete |
| PIPE-05 | Phase 2 | Complete |
| PIPE-06 | Phase 2 | Complete |
| EDIT-01 | Phase 4 | Complete |
| EDIT-02 | Phase 4 | Complete |
| EDIT-03 | Phase 4 | Complete |
| EDIT-04 | Phase 4 | Complete |
| API-01 | Phase 3 | Complete |
| API-02 | Phase 3 | Complete |
| API-03 | Phase 3 | Complete |

**Coverage:**
- v1.0 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

### v2.0

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| ORD-01 | Phase 2 | Complete |
| ORD-02 | Phase 2 | Complete |
| ORD-03 | Phase 2 | Complete |
| ORD-04 | Phase 2 | Complete |
| ORD-05 | Phase 2 | Complete |
| RET-01 | Phase 3 | Complete |
| RET-02 | Phase 3 | Complete |
| RET-03 | Phase 3 | Complete |

**Coverage:**
- v2.0 requirements: 10 total
- Mapped to phases: 10
- Unmapped: 0

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-26 after v2.0 roadmap creation — all 10 v2.0 requirements mapped*
