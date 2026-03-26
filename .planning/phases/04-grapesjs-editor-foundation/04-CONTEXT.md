# Phase 4: GrapesJS Editor Foundation - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Draft 상품에서 GrapesJS 에디터로 바로 진입하면 플레이스홀더 bold-vertical HTML이 캔버스에 로드되고, 반복 로드 시 CSS가 누적되지 않으며 OneShot 코드는 완전히 제거된다. 에디터 기반(EDIT-01, EDIT-02) + 코드 정리(CLEAN-01).

</domain>

<decisions>
## Implementation Decisions

### Draft 진입 경로
- **D-01:** 현재 흐름 유지 — 소싱 상세페이지 → 에디터 버튼 → GrapesJS. Draft일 때 structured 모드를 스킵하고 바로 grapes 모드 진입. 이미 editor/page.tsx:101-108에 구현되어 있으므로 해당 로직 확인/보완.

### 플레이스홀더 내용
- **D-02:** 제네릭 플레이스홀더 유지 — `placeholderDetailPageData` 상수 그대로 사용. `[메인 제목]`, `[상품 설명]` 등 제네릭 라벨. rawData 반영하지 않음. AI Fill CTA(Phase 7)에서 일괄 채우는 흐름.

### CSS 누적 방지
- **D-03:** Claude 재량 — CSS 중복 삽입 방지의 기술적 접근은 계획/구현 단계에서 결정. 핵심은 5회 연속 HTML 재로드 시 `editor.getCss().length` 증가 없음.

### OneShot 제거 범위
- **D-04:** 프론트엔드 + 템플릿 패키지만 — CLEAN-01 요구사항 범위대로 `apps/web` + `packages/templates`. 이미 git status에서 삭제된 파일(`oneshot/config.ts`, `oneshot/index.tsx`) 커밋 + `grep -r "oneshot"` 검증. agents/server는 이 phase 범위 밖.

### Claude's Discretion
- CSS 누적 방지 기술적 접근 (idempotent injection, head clear, data-attribute 체크 등)
- GrapesJS 에디터 설정 최적화 (기존 설정 기반)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Editor Implementation
- `apps/web/src/app/sourcing/[id]/editor/page.tsx` — 에디터 페이지 진입점. structured/grapes 모드 분기, placeholder 로딩 로직
- `apps/web/src/components/editor/DetailPageEditor.tsx` — GrapesJS 에디터 컴포넌트. parseFullHtml(), injectHeadResources(), 캔버스 CSS
- `apps/web/src/lib/template-html.tsx` — renderTemplateToHtml() — React 템플릿 → full HTML 변환

### Templates
- `packages/templates/src/placeholder.ts` — placeholderDetailPageData 상수
- `packages/templates/src/registry.ts` — 템플릿 레지스트리 (bold-vertical, simple-vertical)
- `packages/templates/src/bold-vertical/index.tsx` — bold-vertical 템플릿 컴포넌트
- `packages/templates/src/index.ts` — 패키지 exports

### OneShot (삭제 대상)
- `packages/templates/src/oneshot/config.ts` — 삭제됨 (git status 확인)
- `packages/templates/src/oneshot/index.tsx` — 삭제됨 (git status 확인)

### Requirements
- `.planning/REQUIREMENTS.md` — EDIT-01, EDIT-02, CLEAN-01 요구사항

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `DetailPageEditor` — 완전한 GrapesJS 에디터 (toolbar, blocks, panels, styles, layers, assets, AI panels). 재사용/확장 가능.
- `renderTemplateToHtml()` — React 템플릿 → full HTML document (CSS vars + fonts 포함). 플레이스홀더 HTML 생성에 직접 사용 가능.
- `placeholderDetailPageData` — 제네릭 라벨 + placehold.co 이미지. 이미 정의됨.
- `parseFullHtml()` — full HTML → body/styles/scripts 분리. GrapesJS 로딩용.
- `injectHeadResources()` — iframe head에 CSS/JS 주입. CSS 누적 문제의 핵심 함수.

### Established Patterns
- 에디터 페이지: fetchData() → 상품/프리뷰/CSS 병렬 fetch → 모드 결정 → 렌더링
- GrapesJS 초기화: `GjsEditor` + `WithEditor` + `useEditor` hook 패턴
- CSS: `/templates-styles.css` 정적 파일 + `buildThemeVarsCss()` 동적 CSS vars
- 캔버스 폭: 860px (쿠팡 상세페이지 규격)

### Integration Points
- 소싱 상세페이지(`/sourcing/[id]`)에서 에디터 버튼 → `/sourcing/[id]/editor` 라우팅
- Preview API: `GET /api/products/:id/preview` — template=null일 때 draft 상품
- Product API: `GET /api/products/:id` — rawData, processedData, draftContent, pipelineStep

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-grapesjs-editor-foundation*
*Context gathered: 2026-03-26*
