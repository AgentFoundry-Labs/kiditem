Before working in this directory, always read this document first rather than relying on memory.

# web/thumbnail-ai — Listing Thumbnail Evaluation And AI Edit

`app/(product-pipeline)/product-pipeline/thumbnail-ai/` owns two tabs: listing
evaluation (score the representative image a mall shows) and AI edit (thumbnail
jobs, their candidate assets, and adoption).

## Data Flow

```text
Listing evaluation
  -> channelListingsApi.list (Channels listing query: id + thumbnailUrl)
  -> POST /api/ai/listing-thumbnails/current   {listings:[{channelListingId,imageUrl}]}
  -> POST /api/ai/listing-thumbnails/:id/evaluate {imageUrl, modelId}
AI edit
  -> _shared/hooks/useThumbnailJobs (jobs + candidate assets + workspace summary)
  -> _shared/hooks/useRepresentativeImage (adopt, mall execution status)
```

## Rules

- Evaluation requires an operator-chosen model; never send a default model id.
- Content never reads the Channels listing table; the page sends the listing id
  and image URL it read from the Channels listing query.
- Adoption is `PATCH /api/ai/content-workspaces/:id/current-thumbnail {assetId}`.
  Jobs have no select/apply step and the page never writes a selected URL.
- Polling uses React Query `refetchInterval` while a job is pending or running.
- Evaluation runs one image at a time; do not fan out model calls in parallel.

## Regression Focus

Tab, evaluation, adoption, or polling changes need a focused spec in
`__tests__/page.spec.tsx` or the shared hook specs.
