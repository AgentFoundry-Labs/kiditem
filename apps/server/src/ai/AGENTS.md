Consult this document first instead of relying on memorized knowledge.

# ai — Media AI + Agent Delegation

`src/ai/` owns AI-generated media and detail-page content for the product
pipeline. It contains HTTP entrypoints, AI provider adapters, direct job
schedulers/executors, output projection sinks, and generated-content read/write
services.

## Folder Map

```text
ai/
├── ai.module.ts
├── adapter/in/http/          # controllers and HTTP DTOs
├── adapter/out/
│   ├── direct-output/        # direct generation output projection sinks
│   ├── automation/           # operation-alert adapter
│   ├── channels/             # channel image/listing lookup adapters
│   ├── coupang/              # Coupang/Wing integration adapters
│   ├── gemini/               # Gemini text/media/vision adapters
│   ├── image-fetch/          # guarded remote image fetch adapter
│   ├── products/             # product/content lookup adapters
│   ├── repository/           # reconstructed Prisma repository/query adapters
│   └── wing/                 # Wing automation adapter
├── application/
│   ├── port/in/
│   │   ├── generation/       # generation trigger/cancellation owner ports
│   │   └── workspace/        # workspace/archive owner ports
│   ├── port/out/
│   │   ├── cross-domain/     # ports to automation/products/channels owners
│   │   ├── event/            # generation lifecycle event ports
│   │   ├── provider/         # Gemini/Coupang/fetch provider ports
│   │   ├── repository/       # AI-owned Prisma repository ports
│   │   ├── runtime/          # browser/automation runtime ports
│   │   ├── sink/             # direct generation output sink ports
│   │   └── storage/          # image/media storage ports
│   └── service/              # use-case orchestration
├── domain/                   # pure schemas, prompts, policy helpers
└── mapper/                   # row/DTO/domain mapping
```

## Owned Surfaces

- Image edit: `POST /api/image-ai/edit`, `GET /api/image-ai/tasks/:taskId`
- Text transform: `POST /api/text-ai/transform`
- Detail-page generation and editor APIs: `/api/ai/detail-page/*`
- Saved detail page → marketplace description image:
  `POST /api/ai/detail-page-image/candidate/:candidateId`. Returns
  `{ status: 'missing' }` rather than 404 when no detail page is saved, so
  callers cannot silently substitute another image.
- Generated content archive: `/api/ai/content-archive/*`
- Content asset library: `/api/ai/content-assets`
- Content workspace thumbnail selection:
  `PATCH /api/ai/content-workspaces/:workspaceId/current-thumbnail`
- Thumbnail editor/generation APIs: `/api/thumbnail-editor/*`
- Render, analysis, tracking, Wing sync routes for AI-assisted product media

## Main Data Models

- `ContentWorkspace` is the product-pipeline content/version workspace. Its
  owner is exactly one of `sourcing_candidate`, `channel_listing`, or
  `direct_detail_page`; the old target columns remain rollback projections in
  0.1.8 only.
- `ContentGeneration` is the generated content ledger for detail pages and
  generated images.
- `ContentGenerationGroup` is the transitional archive/media grouping used by
  legacy archive queries and reruns.
- `ContentGenerationSource` records provenance from sourcing candidates, input
  assets, or other generations.
- `DetailPageArtifact` is the editable detail-page identity.
- `DetailPageRevision` is the append-only edited HTML/version record.
- `ContentAsset` stores reusable media in a workspace group.
- `ContentThumbnailSelection` is the listing/workspace-owned current-thumbnail
  pointer to a managed asset, generated candidate, or adopted external image.
- `ContentGenerationAssetUsage` stores the current asset usage set for one
  generation.
- `ThumbnailGeneration` is the thumbnail generation ledger.
- `AiDirectJob` is the durable execution ledger for direct thumbnail,
  detail-page, image-edit, and thumbnail re-edit work. It owns claims, leases,
  retries, validated output checkpoints, cancellation, and recovery.

Thumbnail analysis, generation, editing, tracking, and Wing registration use
`ContentWorkspace.id` as `contentWorkspaceId`. `sourceCandidateId` is
provenance, `channelListingId` identifies the marketplace listing, and
`generationId` identifies the ledger row. Do not reintroduce `productId`,
`masterId`, or `MasterProduct` terminology for a thumbnail workspace.

## Direct AI Generation Flow

Detail-page, thumbnail, and image-edit generation are asynchronous direct AI
jobs. They are not Agent OS runs unless a future autonomous Agent owns
orchestration and calls them as a child tool/action.

```text
HTTP/service request
  -> atomically create the domain ledger, input provenance, and held AiDirectJob
  -> create the operation alert or parent-child link
  -> release the AiDirectJob
  -> worker claims with FOR UPDATE SKIP LOCKED and a lease
  -> executor performs provider/media work with the worker AbortSignal
  -> worker checkpoints validated output
  -> sink atomically projects output into domain rows
  -> worker marks the job succeeded and closes the alert
```

Direct executors return validated output and do not update AI domain tables.
Sinks own the `ContentGeneration` / `ThumbnailGeneration` terminal projection,
generated asset usage, `DetailPageArtifact` creation, and alert closure. Image
edit has no content ledger, so its direct job writes result/error metadata to
the operation alert that backs `/api/image-ai/tasks/:taskId`.

`projecting` jobs resume from their checkpoint without invoking a model again.
Held jobs become recoverable after the hold timeout, and expired running or
projecting leases can be reclaimed. Queue cancellation is applied before the
domain/alert cancellation projection and aborts a claiming worker through its
lease heartbeat. Direct jobs are deterministic execution infrastructure and
must never create Agent OS runs.

Historical Agent OS rows for `detail_page_generate`, `thumbnail_generate`, and
`image_edit` are retired by the v0.1.2 data migration. New producer code must
not enqueue those types, and the Agent OS executor resolves only real Agent
definitions.

## Detail-Page Notes

- `DetailPageAiService` is a facade; generation, prefill, and query behavior
  live in dedicated application services.
- Product-bound runs attach through the canonical product workspace group.
- Sourcing-candidate runs keep primary lineage on
  `ContentGeneration.sourceCandidateId`.
- Product-less operator runs use a direct content workspace and must not create
  a collected-product `SourcingCandidate`.
- Initial generated output lives in `ContentGeneration.generationResult`.
- Editor saves append `DetailPageRevision` rows and update
  `DetailPageArtifact.currentRevisionId`.
- Registration branches selected artifact/revision metadata and HTML from a
  candidate workspace into a listing-owned workspace. It reuses storage URLs
  and the managed thumbnail asset, but never clones generation jobs or
  candidates.
- New editor saves must not write edited HTML back to
  `ContentGeneration.editedHtml` or `MasterProduct.draftContent`.

## Cross-Domain Ports

- Sourcing calls AI through `AI_WORKSPACE_ARCHIVE_PORT`,
  `PRODUCT_GENERATION_AI_TRIGGER_PORT`, and
  `POST_PROMOTION_AI_TRIGGER_PORT`; account registration additionally consumes
  AI's `REGISTRATION_CONTENT_WORKSPACE_PORT`.
- AI publishes incoming generation/workspace ports from
  `application/port/in/{generation,workspace}/`.
- AI uses `AI_OPERATION_ALERT_PORT` from
  `application/port/out/cross-domain/` for operation-alert lifecycle writes.
- Image edit, detail page, and thumbnail generation schedule direct AI jobs
  through their owner application services.
- Provider/media/fetch/storage behavior belongs behind the relevant
  `application/port/out/{provider,storage}/` contract.
- Inventory's read-only display-media port returns organization-owned active
  Coupang catalog assets by exact option then primary fallback.
- Direct detail page, thumbnail, and image-edit generation use `AI_*`.
  Agent OS uses `AGENT_*` only for real Agent definitions.

## Boundary Rules

- `domain/` is pure: no NestJS, Prisma, provider SDKs, filesystem, Agent OS, or
  HTTP dependencies.
- Reconstructed application services depend on ports, not concrete
  `adapter/out/**` implementations.
- Image edit, thumbnail, and detail-page generation must go through direct AI
  job services; controllers do not call image providers directly.
- Gemini/model selection is explicit. Missing model/env is an error, not a
  fallback.
- Detail-page media prompt and image-selection wording lives in
  `domain/detail-page-media-prompts.ts`.
- Asset deletion and archive GC must reject assets referenced by active
  generation usage or any current-thumbnail selection.
- Thumbnail quality grades are registration-only and independent from product ABC.
- When generation controls change, check shared tuple/type, HTTP DTO, web
  payload, direct generation input/output schema, stored raw-input normalizer,
  sink, and recovery behavior together.

## Transitional Exceptions

These are known same-domain shortcuts. Do not grow them without replacing or
compacting the exception.

- AI application services do not import Prisma, HTTP DTOs, or concrete
  `adapter/out/**` implementations. Keep new persistence/provider/media work
  behind `application/port/out/*` contracts.
- Thumbnail generation, analysis, tracking, Wing registration, image fetch,
  reference-image warm-up, image generation, and vision/verify provider calls
  are behind outbound ports.
- Prisma query/write helper modules for AI-owned rows live beside their
  repository adapters. Do not reintroduce `adapter/out/prisma` as a legacy
  staging area.
- `render-image.controller.ts` still owns inline Puppeteer/filesystem
  rendering.
- Authenticated Wing catalog collection belongs to Channels plus the browser
  extension. AI consumes listing workspace media and must not restore a
  separate image-sync job map or server-side Wing scrape fallback.
