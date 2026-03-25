# Requirements: KidItem

**Defined:** 2026-03-25
**Core Value:** 소싱 상품을 최소한의 수작업으로 판매 가능한 상세페이지로 변환한다.

## v1.0 Requirements

Requirements for milestone v1.0: 상세페이지 파이프라인 리팩토링

### Schema

- [x] **SCHM-01**: Product에 draftContent (JSONB) 컬럼 추가하여 Step 1 결과를 별도 저장할 수 있다
- [x] **SCHM-02**: Product에 pipelineStep (String) 컬럼 추가하여 파이프라인 진행 단계를 추적할 수 있다

### Pipeline

- [ ] **PIPE-01**: 사용자가 AI 재가공 시 콘텐츠만 생성하고 (한국어 카피 + 테마 컬러), 이미지는 생성하지 않는다
- [ ] **PIPE-02**: 사용자가 에디터에서 확정 후 이미지 생성을 별도 트리거할 수 있다
- [ ] **PIPE-03**: 이미지 생성 시 사용자가 선택한 히어로 이미지 1장으로 배너/메인/디테일 전부 생성한다
- [ ] **PIPE-04**: 기존 이미지 분류(_analyze_product) 호출을 제거하고 히어로 기반으로 전환한다
- [ ] **PIPE-05**: 사이즈 차트 OCR 감지는 기존대로 유지한다
- [ ] **PIPE-06**: agent_tasks.input에 확정된 데이터를 스냅샷으로 저장하여 race condition을 방지한다

### Editor

- [ ] **EDIT-01**: 에디터에서 텍스트 필드를 직접 편집할 수 있다 (제목, 훅텍스트, 키포인트, 스펙 등)
- [ ] **EDIT-02**: 에디터에서 테마 컬러 7개를 컬러 피커로 변경할 수 있다
- [ ] **EDIT-03**: 에디터에서 raw_data.images 중 히어로 이미지를 선택할 수 있다
- [ ] **EDIT-04**: 편집 내용이 실시간으로 템플릿 프리뷰에 반영된다

### API

- [ ] **API-01**: PUT /api/products/:id/draft-content로 편집 내용을 저장할 수 있다
- [ ] **API-02**: GET /api/products/:id/preview가 draftContent 기반으로 프리뷰를 제공한다
- [ ] **API-03**: POST로 이미지 생성 단계를 트리거할 수 있다

## Future Requirements

### Enhancements

- **ENH-01**: 디바운스 자동 저장 (편집 중 페이지 이탈 시 데이터 보존)
- **ENH-02**: 이미지 생성 후 개별 이미지 재생성 기능
- **ENH-03**: 템플릿 변경 기능 (bold-vertical ↔ simple-vertical 전환)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Oneshot 파이프라인 변경 | 템플릿 모드만 대상, oneshot은 별도 흐름 유지 |
| 새 템플릿 추가 | 파이프라인 분리에 집중, 기존 템플릿 활용 |
| 모바일 앱 | 웹 우선 |
| GrapesJS 구조화 데이터 동기화 | GrapesJS는 최종 HTML 편집용으로만 유지 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SCHM-01 | Phase 1 | Complete |
| SCHM-02 | Phase 1 | Complete |
| PIPE-01 | Phase 2 | Pending |
| PIPE-02 | Phase 2 | Pending |
| PIPE-03 | Phase 2 | Pending |
| PIPE-04 | Phase 2 | Pending |
| PIPE-05 | Phase 2 | Pending |
| PIPE-06 | Phase 2 | Pending |
| EDIT-01 | Phase 4 | Pending |
| EDIT-02 | Phase 4 | Pending |
| EDIT-03 | Phase 4 | Pending |
| EDIT-04 | Phase 4 | Pending |
| API-01 | Phase 3 | Pending |
| API-02 | Phase 3 | Pending |
| API-03 | Phase 3 | Pending |

**Coverage:**
- v1.0 requirements: 15 total
- Mapped to phases: 15
- Unmapped: 0

---
*Requirements defined: 2026-03-25*
*Last updated: 2026-03-25 after roadmap creation — all 15 requirements mapped*
