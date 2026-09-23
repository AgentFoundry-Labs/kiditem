Before working in this directory, always read this document first rather than relying on memory.

# content — Media AI And Direct Generation

`src/content/` owns generated media, detail-page content, direct AI job execution,
workspace projection, and provider/storage adapters. HTTP adapters live under
`adapter/in`; application orchestration uses ports; `domain/` is pure.

## Identity And Ledgers

- `ContentWorkspace` is owned by one selling product, one channel listing
  (catalog import), or one direct detail page. A selling product has exactly one
  active workspace, created in the product's own transaction; a product
  workspace never carries a listing id (listings reach it through the product).
  Content models are ten: workspace, asset, listing thumbnail evaluation,
  thumbnail job, detail page, revision, detail image artifact, render intent,
  direct job, usage record (KID-313 W3; the usage record stays by 결정 16).
- `ContentAsset` is the one table for uploads, AI thumbnail candidates, detail
  images and catalog photos; `source` says where a row came from and
  `thumbnailGenerationId` links an AI candidate to its job. The workspace's
  `currentThumbnailAssetId` is the only representative-image pointer, and every
  mall representative-image execution reads that asset.
- `DetailPage` plus append-only revisions owns detail HTML; every start
  (generated, manual, uploaded, imported) is one row and the AI result is a
  `generated` revision. The workspace's `currentDetailPageRevisionId` is the
  only pointer malls read. Render-intent and immutable image-artifact rows own
  bounded marketplace JPEG output; Wing is one consumer.
- `ListingThumbnailEvaluation` scores the representative image a mall actually
  shows, one row per (listing, image URL) received from Channels; a changed
  image gets a new row. `ThumbnailGeneration` is the job only.
- `AiDirectJob` owns claims, leases, retries, checkpoints, cancellation, and
  recovery for thumbnail, detail-page, image-edit, and re-edit work.
- Use `contentWorkspaceId` for media workspaces. Sourcing candidate and
  candidate-image ids are provenance columns with no foreign key; AI never reads
  a Channels or Sourcing row to fill a prompt or a name. Do not reintroduce
  MasterProduct terminology.

The complete schema is
[prisma/models/ai.prisma](../../../../prisma/models/ai.prisma), and direct-job,
workspace, render, and recovery rules are executable in
[the AI tests](__tests__/). The architecture-level direct-execution contract
lives in [docs/ARCHITECTURE.md](../../../../docs/ARCHITECTURE.md).

## Direct Job Contract

- Atomically create the domain ledger/provenance and a held direct job, attach
  its alert or parent relation, then release it.
- A leased worker performs provider/media work, checkpoints validated output,
  and invokes a sink that atomically projects terminal domain rows.
- Executors return validated data and do not mutate AI tables. Sinks own
  generation projection, generated-image assets, and alert closure.
- Projecting jobs resume from checkpoints without another model call. Expired
  leases and held jobs follow the tested recovery policy; cancellation reaches
  the claiming worker through its heartbeat.
- Direct generation is deterministic infrastructure and does not create Agent
  OS runs. Agent-prefixed runtime keys are reserved for real Agent definitions.

## Detail-Page Contract

- One detail-page id serves the editor, generation, history, and hub. A
  generation is `ready` only with its recorded result; the first saved HTML of
  a generated page is its `generated` revision, later saves are `manual_edit`.
  Saves do not schedule a marketplace render.
- A machine revision (`generated`, `imported`) never replaces a human one
  (`manual_edit`, `duplicate`) as current; it only appends to history. Only
  the detail-page repository moves the two current pointers.
- A mall form's detail image reuses a verified matching artifact or
  synchronously renders the chosen immutable revision (the registration
  target's, else the current one) as the bounded 780px JPEG
  (`wing-server-jpeg-v1` is the format id).
  Browser-extension capture and split/stitch rendering remain retired.
- Missing saved HTML returns the explicit missing result. Callers do not
  substitute another image.
- Registration does not touch the product workspace; listings reach it through
  the selling product. Photo mirroring rewrites imported revisions in place and
  keeps their source digest.
- Product-less operator generation uses a direct workspace, not a synthetic
  sourcing candidate.

## Usage Metering

- Every Gemini call reports its `usageMetadata` to `aiUsageMeter`; it never
  throws into a model call. `AiUsageService` prices it once at record time into
  `ai_usage_records`; a model without a listed price records tokens with a null
  cost, never a guessed one.
- Attribution comes from context, not callers: `AiUsageContextInterceptor`
  maps the request's `/api/<segment>` to an agent, and a direct job runs as the
  상품 agent under its own organization. A call with no context goes unmetered.

## Ports And Boundaries

- Controllers schedule image edit, thumbnail, and detail-page work through
  direct-job application services; they never call providers directly.
- Sourcing, Alerts, Inventory display media, provider/media/fetch, and storage
  integrations use their named incoming or outgoing ports.
- Model selection is explicit. Asset deletion/GC rejects active generation
  usage and current-thumbnail references.
- Generation-control changes update shared type/tuple, HTTP DTO, web payload,
  stored input normalization, direct input/output schema, sink, and recovery
  together.
- Keep Puppeteer rasterization in its bounded owner service. Authenticated Wing
  collection belongs to Channels plus the extension, not an AI scrape
  fallback.
