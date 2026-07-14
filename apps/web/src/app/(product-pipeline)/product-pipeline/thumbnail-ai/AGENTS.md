Consult this document first instead of relying on memorized knowledge.

# web/thumbnail-ai — Thumbnail Analysis Dashboard

`app/(product-pipeline)/product-pipeline/thumbnail-ai/` owns the six-tab
thumbnail analysis dashboard, smart polling, batch analysis/cancel controls,
and optimistic candidate selection UI.

Shared generation hooks live in
`app/(product-pipeline)/product-pipeline/_shared/hooks/useThumbnailGenerations.ts`.

## Owned Surfaces

- Thumbnail dashboard tabs: unclassified, all, needs-fix, AI edit, history,
  tracking
- Thumbnail analysis and batch analysis controls
- Batch cancel UI
- Candidate select/apply/skip controls reused with thumbnail generation
- Source media comes from sourcing/listing content workspaces. This route does
  not own a separate Wing image-sync action.

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

## Verification

For thumbnail-ai changes, run the narrow route suite first, then the web build:

```bash
npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/thumbnail-ai'
```

Tab, polling, cancellation, or optimistic-update changes need a focused
regression spec for query-key and mutation behavior.
