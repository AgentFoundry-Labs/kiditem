Consult this document first instead of relying on memorized knowledge.

# web/thumbnail-ai — Thumbnail Analysis Dashboard

`app/(product-pipeline)/product-pipeline/thumbnail-ai/` owns the six-tab
thumbnail analysis dashboard, smart polling, batch analysis/cancel controls,
and optimistic candidate selection UI.

## Folder Map

```text
thumbnail-ai/
├── page.tsx              # tabs, batch refs, route composition
├── components/           # cards, modals, queues, KPI/chart pieces
├── hooks/                # thumbnail analysis/tracking/batch/action hooks
└── lib/                  # Coupang Wing opener, image URL resolver
```

Shared generation hooks live in
`app/(product-pipeline)/product-pipeline/_shared/hooks/useThumbnailGenerations.ts`.

## Owned Surfaces

- Thumbnail dashboard tabs: unclassified, all, needs-fix, AI edit, history,
  tracking
- Thumbnail analysis and batch analysis controls
- Batch cancel UI
- Candidate select/apply/skip controls reused with thumbnail generation

## State + Data Flow

```text
React Query hooks
  -> apiClient /api/thumbnail-analysis/*
  -> queryKeys.thumbnailAnalysis.*
  -> smart refetchInterval while pending/generating rows exist
  -> optimistic candidate mutation with rollback
```

Batch progress uses `AbortController` refs plus server cancel and immediate UI
state updates.

## Cross-Route Dependencies

- `@kiditem/shared` provides `ThumbnailAnalysisResult` and
  `ThumbnailGenerationItem`.
- Shared generation hook provides `useGenerationList`, `useSelectCandidate`,
  `useApplyGeneration`, and `useSkipGeneration`.
- `resolveImageUrl()` is the image URL normalization path.
- Grade colors come from `../_shared/lib/thumbnail-grade.ts`.

## Boundary Rules

- All backend calls use `apiClient` and `queryKeys.thumbnailAnalysis.*`; no raw
  `fetch`.
- Polling uses `refetchInterval`; no `setInterval`, EventSource, or WebSocket.
- Tab and pagination state stay local.
- Mutations use explicit invalidation and `onSettled` to avoid races.
- File upload uses `FileReader.readAsDataURL`; no form submission.
- Do not add Canvas/image manipulation here; image work belongs to external API
  flows.

## Change Coupling

- New tabs touch `page.tsx`, `ThumbnailFilterTabs.tsx`, and the tab component.
- Polling cadence changes belong in the shared generation hook.
- Batch cancel UX changes touch `page.tsx` refs plus the server cancel endpoint.
- Optimistic updates should follow the existing `onMutate/onError/onSettled`
  pattern.
