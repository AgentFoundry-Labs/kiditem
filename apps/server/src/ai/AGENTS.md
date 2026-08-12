# ai — Media AI And Direct Generation

`src/ai/` owns generated media, detail-page content, direct AI job execution,
workspace projection, and provider/storage adapters. HTTP adapters live under
`adapter/in`; application orchestration uses ports; `domain/` is pure.

## Identity And Ledgers

- `ContentWorkspace` is owned by one sourcing candidate, channel listing, or
  direct detail page. `ContentGeneration` and its sources record generated
  content and provenance.
- `DetailPageArtifact` plus append-only revisions owns editable HTML.
  Render-intent and immutable image-artifact rows own bounded Wing JPEG output.
- `ContentThumbnailSelection` is the workspace's managed current-thumbnail
  pointer. `ThumbnailGeneration` is its generation ledger.
- `AiDirectJob` owns claims, leases, retries, checkpoints, cancellation, and
  recovery for thumbnail, detail-page, image-edit, and re-edit work.
- Use `contentWorkspaceId` for media workspaces. Candidate, listing, and
  generation IDs are provenance or ledger identities; do not reintroduce
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
  generation projection, asset usage, artifacts, and alert closure.
- Projecting jobs resume from checkpoints without another model call. Expired
  leases and held jobs follow the tested recovery policy; cancellation reaches
  the claiming worker through its heartbeat.
- Direct generation is deterministic infrastructure and does not create Agent
  OS runs. Agent-prefixed runtime keys are reserved for real Agent definitions.

## Detail-Page Contract

- Editor saves append a revision and update the artifact pointer; they do not
  schedule a marketplace render or write legacy product/generation HTML fields.
- Wing preparation reuses a verified matching artifact or synchronously renders
  the immutable revision as the bounded 780px `wing-server-jpeg-v1` JPEG.
  Browser-extension capture and split/stitch rendering remain retired.
- Missing saved HTML returns the explicit missing result. Callers do not
  substitute another image.
- Registration branches selected revision, HTML, and managed media into a
  listing workspace without cloning jobs or candidates.
- Product-less operator generation uses a direct workspace, not a synthetic
  sourcing candidate.

## Ports And Boundaries

- Controllers schedule image edit, thumbnail, and detail-page work through
  direct-job application services; they never call providers directly.
- Sourcing, operation alerts, Inventory display media, provider/media/fetch,
  and storage integrations use their named incoming or outgoing ports.
- Model selection is explicit. Asset deletion/GC rejects active generation
  usage and current-thumbnail references.
- Generation-control changes update shared type/tuple, HTTP DTO, web payload,
  stored input normalization, direct input/output schema, sink, and recovery
  together.
- Keep Puppeteer rasterization in its bounded owner service. Authenticated Wing
  collection belongs to Channels plus the extension, not an AI scrape
  fallback.
