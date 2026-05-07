# web/sourcing — Product Sourcing + GrapesJS WYSIWYG Editor + AI Edit Panels

**product 발견(list) → 메타 편집(detail) → 상세페이지 시각 편집(editor)** 의 3-stage UI. 핵심 복잡성은 `[id]/editor/` — GrapesJS Canvas + AI 이미지/텍스트 편집 패널.

## Subroute Map

```
sourcing/
├── page.tsx                    # 리스트 (50/page, scrape, processing 폴링)
├── [id]/page.tsx               # 상세 (basic/images/sizes/features/raw 5탭)
├── [id]/editor/page.tsx        # 에디터 진입점 (데이터 fetch + 정규화)
├── [id]/editor/components/
│   ├── DetailPageEditor.tsx    # 핵심 — GrapesJS 1700+ LOC
│   ├── AIImageEditPanel.tsx
│   ├── AITextEditPanel.tsx
│   ├── ImagePickerModal.tsx
│   └── ...
├── components/list/, detail/   # 분리된 컴포넌트
├── lib/
│   ├── sourcing-api.ts
│   ├── template-html.tsx       # renderTemplateToHtml() util
│   └── types.ts
```

## 핵심 패턴

### 1. 리스트 페이지 — Processing Polling

`sourcing/page.tsx`:
- 50/page pagination
- `processingIds` (Set) — 진행 중 product 추적
- `refetchInterval: hasProcessing ? 3000 : false` — processing 있을 때만 3s polling
- Status 변경 감지 → processingIds 자동 정리
- URL scrape inline (POST `/api/sourcing/scrape-url`)

### 2. 상세 페이지 — Local-Only Edit + Template Preview

`sourcing/[id]/page.tsx`:
- 3 fetch 병렬: `/api/products/${id}` + `/api/products/${id}/preview` + `/templates-styles.css`
- `editData: ProductEditState` — useState 로컬 (5 탭)
- **DB 저장 안 함** — preview only (사용자가 별도로 publish)
- Template render: `parseDetailPageData()` → `getTemplate(templateId)` → `renderTemplateToHtml()` → MobilePreview iframe

### 3. Editor — GrapesJS Architecture

`DetailPageEditor.tsx`:
- 패키지: `grapesjs@0.22.14` + `@grapesjs/react@2.0.0`
- React wrapper: `<GjsEditor grapesjs={grapesjs} options={GRAPESJS_OPTIONS} onEditor={handleEditorInit} />`
- Canvas: `<Canvas />` (iframe 내부)
- 디바이스: '쿠팡 상세페이지' (860px width)
- Storage: **disabled** (`storageManager: false`) — 외부 저장 안 함, parent 가 관리

#### Custom Blocks (7종)
- 기본: heading1/H1, heading2/H2, text-block
- 도형: rectangle, circle-shape, image, line
- 아이콘: Lucide React mapped per blockId

#### Style Manager Sectors
1. 레이아웃 (display, width, padding, margin)
2. 타이포그래피 (font-*, color, line-height)
3. 배경 (bg-color, bg-image, size, position)
4. 테두리 (border, border-radius, box-shadow)
5. 효과 (opacity, transform)

#### Save/Load
- Save: `editor.getHtml()` + `editor.getCss({ avoidProtected: true })` → 합쳐서 `html + '<style>' + css + '</style>'`
- Load: `editor.setComponents()` + `editor.setStyle()` (init 시)
- 닫기: `handleSave()` → `router.push()` (DB persist 는 detail page 로 이동 후)

#### Iframe 주입 (Canvas CSS)
`canvas:frame:load:body` 이벤트:
- 템플릿 CSS + font links 를 iframe head 로 주입
- Fingerprint dedup (length + slice 비교) — 중복 stylesheet 방지

### 4. AI Image Edit Panel

`AIImageEditPanel.tsx` — 우클릭/액션 버튼으로 모달 표시:
- 5 preset: `remove_background`, `remove_text`, `replace_background` (사용자 입력), `enhance`, `full_regenerate`
- Custom prompt textarea
- **Async API + polling**:
  - POST `/api/image-ai/edit` → `{ taskId }` (`AgentRunRequest.id`)
  - GET `/api/agent-os/requests/{taskId}` 매 2s × max 60회 (120s timeout)
  - request `status='succeeded'` + `latestRunId` 확인 후
    GET `/api/agent-os/runs/{latestRunId}`
  - `run.output.image_url` 추출 → component.src 업데이트
- `isBusy.current` (ref) 로 동시 편집 차단

### 5. AI Text Edit Panel

`AITextEditPanel.tsx` — 텍스트 컴포넌트 우클릭:
- 3 preset: `rewrite`, `translate`, `shorten`
- Custom prompt
- **Sync API** (no polling): POST `/api/text-ai/transform` → `{ result }`
- 결과 미리보기 + Apply/Regenerate/Dismiss

#### Apply Workflow — UndoManager Pause
```typescript
um.stop();                            // undo 기록 일시 중지
applyTextToComponent(component, newText);
um.start();                           // 재개
```

이유: undo 시 AI 결과만 되돌릴 수 없게 해서 사용자 혼란 방지.

### 6. Image Upload — base64 Passthrough

`ImagePickerModal.tsx`:
- 3 탭: 원본 이미지, 생성 이미지, 업로드
- 업로드: FileReader.readAsDataURL() → base64 string
- **서버 업로드 안 함** — base64 그대로 component.src 에 세팅
- Gallery: 부모가 `rawImages` / `processedImages` props 로 전달

### 7. Template 렌더링

`lib/template-html.tsx` — `renderTemplateToHtml()`:
1. `renderToStaticMarkup(<Component data={data} />)` — React → HTML 문자열
2. CSS vars 생성 (themeColorMain, themeSectionBg 등) → `:root { --theme-*: ... }`
3. Font links 주입
4. DOCTYPE + head + body 래핑
5. 반환: full HTML document string

`@kiditem/templates` 에서 template config + component 로드.

## 외부 의존

- `grapesjs`, `@grapesjs/react`
- `@kiditem/templates` (template component + getTemplate + parseDetailPageData)
- `apiClient` (`/api/image-ai/edit`, `/api/text-ai/transform`, `/api/agent-os/requests/{id}`, `/api/agent-os/runs/{id}`, `/api/sourcing/...`, `/api/products/{id}`)
- `API_BASE` (image URL resolution: `/processed/...` → full URL)
- `queryKeys.sourcing` (list/detail/preview)

## 금지 (Hard bans)

- ❌ `editor.saveJSON()` (HTML+CSS export 만 — `getHtml()` + `getCss()`)
- ❌ Editor 안에서 image 서버 업로드 (base64 passthrough 또는 기존 URL 만)
- ❌ Local storage (`storageManager: false` — 의도)
- ❌ 동시 AI 편집 (isBusy.current ref 로 차단)
- ❌ UndoManager pause 없이 AI 결과 적용 (undo 깨짐)
- ❌ 새 GrapesJS plugin 무분별 추가 (canvas 충돌 위험)
- ❌ Detail page 에서 DB 직접 update (preview only — publish 별도)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| AI preset 추가/변경 | `AIImageEditPanel.tsx` 또는 `AITextEditPanel.tsx` + 백엔드 (`server/ai/`) preset 매칭 |
| Custom block 추가 | `DetailPageEditor.tsx` blockManager 섹션 + Lucide 아이콘 매핑 |
| Template 종류 추가 | `@kiditem/templates` 패키지 (component + config) + getTemplate() 등록 |
| Style sector 변경 | `DetailPageEditor.tsx` styleManager.sectors |
| Polling interval (image task) | `AIImageEditPanel.tsx` (현재 2s × 60) — load 영향 검토 |
| Save HTML 형식 | `DetailPageEditor.tsx:handleSave()` + detail page 로드 로직 (parseFullHtml 등) |
| Image gallery 소스 추가 | `ImagePickerModal.tsx` 탭 + editor props (rawImages/processedImages) |
| Refetch interval (list polling) | `sourcing/page.tsx:refetchInterval` |
