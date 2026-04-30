# web/thumbnails — Smart Polling + Batch + Optimistic UI

23 파일. **6 탭 dashboard + dynamic refetchInterval + AbortController 배치 cancel**. 무거운 분석 jobs 를 실시간으로 추적.

## Structure

```
thumbnails/
├── page.tsx             # 6 tabs (unclassified/all/needsfix/ai-edit/history/tracking)
├── components/          # ProductCard, DetailModal, GenerationQueue, ThumbnailCard,
│                        # AnalysisKpiCards, GradeDonutChart, ScoreBreakdown 등
├── hooks/               # 도메인 hooks (re-export from src/hooks/useThumbnailGenerations)
└── lib/                 # coupang-wing.ts, resolve-url.ts, grade-constants.ts
```

## 핵심 패턴

### 1. Smart Polling — Dynamic refetchInterval

`src/hooks/useThumbnailGenerations.ts:14-18`:
```typescript
useGenerationList()  // refetchInterval: data 안에 pending/generating 있으면 3000ms, 아니면 false
```

데이터 상태 보고 자동으로 폴링 on/off. **고정 setInterval 절대 금지**.

### 2. Optimistic UI + Rollback

`useSelectCandidate()` (src/hooks/useThumbnailGenerations.ts:29-42):
1. Mutation 시작 → `queryClient.cancelQueries`
2. Cache 직접 수정 (즉시 UI 반영)
3. Mutation 실패 → 이전 cache 복원 (rollback)
4. `onSettled` → 최종 invalidation

### 3. Batch Progress + AbortController

page.tsx:74-115 — `batchAbortRef` + `batchCancelRef` ref 로 진행 중 배치 추적. 사용자 cancel → AbortController.abort() → 서버 cancel + UI 즉시 반영. `batchStartTime` + 타이머로 elapsed 표시.

### 4. File Upload — FileReader

`UploadAnalyzer.tsx:52-58` — 파일 input → `FileReader.readAsDataURL` → base64 → API 즉시 호출. **form submission 없음** (fast UX).

## Rules

- 모든 fetch 는 `queryKeys.thumbnailAnalysis.*` + apiClient (raw fetch 절대 금지)
- 탭 / pagination 은 **로컬 state** (URL 또는 server state 아님)
- Grade 색상은 `gradeBg` map (S→emerald, A→blue, B→amber, C→orange, F→red) 하드코딩
- @kiditem/shared 타입 필수: `ThumbnailAnalysisResult`, `ThumbnailGenerationItem`
- Mutation 후: 명시적 `invalidateQueries`. `onSettled` 사용해서 race 방지
- Image URL 정규화: `resolveImageUrl()` 유틸 경유

## Prohibits

- ❌ `setInterval` (refetchInterval 만)
- ❌ EventSource / WebSocket (polling 만)
- ❌ Canvas / image manipulation (외부 API 만)

## Cross-domain deps

- `@kiditem/shared` — `ThumbnailAnalysisResult`, `ThumbnailGenerationItem`
- `apiClient` — `/api/thumbnail-analysis/*`, `/api/thumbnail-analysis/generations/*`
- Coupang Wing 통합 — `openCoupangWingInventory()` (lib/coupang-wing.ts)
- `src/hooks/useThumbnailGenerations` — 공유 hook (이 도메인에서 re-export)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| 새 탭 추가 | `page.tsx` activeTab 타입 + `ThumbnailFilterTabs.tsx` + 탭 컴포넌트 |
| Polling cadence 변경 | `src/hooks/useThumbnailGenerations.ts:14-18` (interval 함수) |
| Grade 색 매핑 변경 | `lib/grade-constants.ts` + 모든 컴포넌트 (GradeDonutChart, ScoreBreakdown 등) |
| Batch cancel UX | `page.tsx:74-115` (refs + AbortController) + 서버 cancel endpoint |
| Optimistic update 추가 | mutation hook 의 `onMutate/onError/onSettled` 패턴 따르기 |
