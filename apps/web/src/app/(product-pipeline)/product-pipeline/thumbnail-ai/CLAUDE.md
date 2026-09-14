Before working in this directory, always read this document first rather than relying on memory.

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
- Dashboard product rows and product-backed actions use active Coupang
  channel-listing workspaces only. Sourcing-candidate/collected workspaces
  remain provenance and must never surface in this route. This route does not
  own a separate Wing image-sync action.

## State + Data Flow

```text
React Query hooks
  -> apiClient /api/thumbnail-analysis/*
  -> queryKeys.thumbnailAnalysis.*
  -> smart refetchInterval while pending/generating rows exist
  -> optimistic candidate mutation with rollback
```

Batch progress is local UI state. Cancellation aborts the active request and
stops remaining chunks; report server job cancellation only with an owner receipt.

Thumbnail results and generations join on `contentWorkspaceId`. Tracking rows
use `channelListingId`; collected-product entry keeps `sourceCandidateId` as
provenance. Thumbnail requests, URLs, query keys, and local maps must not use
`productId` or `masterId` as workspace aliases.

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

## Regression Focus

Tab, polling, cancellation, or optimistic-update changes need a focused
regression spec for query-key and mutation behavior.
