# Requirements: KidItem

**Defined:** 2026-03-26
**Core Value:** 소싱 상품을 최소한의 수작업으로 판매 가능한 상세페이지로 변환한다

## v2.1 Requirements

Requirements for v2.1 WYSIWYG 상세페이지 에디터. Each maps to roadmap phases.

### 에디터 기반

- [ ] **EDIT-01**: 수집 직후(draft) 상품에서 GrapesJS 에디터로 바로 진입할 수 있다
- [ ] **EDIT-02**: 에디터 진입 시 bold-vertical 플레이스홀더 HTML이 GrapesJS 캔버스에 로드된다
- [ ] **EDIT-03**: GrapesJS 모드에서 "AI로 나머지 채우기" CTA를 클릭하면 빈 필드가 AI로 자동 생성된다

### 개별 요소 AI

- [ ] **AI-01**: 텍스트 요소 선택 시 AI 액션 패널이 나타나고 다시쓰기/번역/축약이 동작한다
- [ ] **AI-02**: 이미지 요소 선택 시 AI 편집 패널이 나타나고 배경 제거/AI 생성이 동작한다 (기존 재설계)
- [ ] **AI-03**: AI 액션 중 로딩 상태 표시 + 에러 피드백 + Undo 지원
- [ ] **AI-04**: AI 생성 결과를 캔버스에 실시간 반영 — 텍스트는 스트리밍, 이미지는 완성 즉시 교체. 생성 중 편집 잠금

### 코드 정리

- [ ] **CLEAN-01**: OneShot 파이프라인 코드가 프론트엔드 + 템플릿 패키지에서 완전히 제거된다

## Future Requirements

- 정산 데이터 조회 (수수료, 정산금)
- 문의/리뷰 관리 (SLA 추적)
- 쿠팡 API 실시간 연동 (API 키 확보 시)
- AI 디자인 챗 (전체 페이지 리라이트)
- Export PNG (render-image)

## Out of Scope

| Feature | Reason |
|---------|--------|
| "모든 텍스트 한번에 개선" | 균일한 결과물, 리뷰 불가, 15개 동시 LLM 호출 |
| 타이핑 중 실시간 AI 제안 | 리스팅 준비 도구, 쓰기 도구 아님 |
| 멀티 요소 선택 AI | GrapesJS 멀티셀렉트 불안정 |
| AI 버전 히스토리/diff | GrapesJS UndoManager로 충분 |
| simple-vertical 템플릿 지원 | bold-vertical만 우선 |
| 템플릿 선택/전환 UI | 추후 확장 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| EDIT-01 | — | Pending |
| EDIT-02 | — | Pending |
| EDIT-03 | — | Pending |
| AI-01 | — | Pending |
| AI-02 | — | Pending |
| AI-03 | — | Pending |
| AI-04 | — | Pending |
| CLEAN-01 | — | Pending |

**Coverage:**
- v2.1 requirements: 8 total
- Mapped to phases: 0
- Unmapped: 8 ⚠️

---
*Requirements defined: 2026-03-26*
*Last updated: 2026-03-26 after initial definition*
