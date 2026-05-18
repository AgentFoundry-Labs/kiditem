# ai — Media AI + Agent Delegation

`src/ai/` owns AI-generated media and detail-page content for the product
pipeline. It contains HTTP entrypoints, AI provider adapters, Agent OS runtime
handlers, output bridges/sinks, and generated-content read/write services.

## Folder Map

```text
ai/
├── ai.module.ts
├── adapter/in/http/          # controllers and HTTP DTOs
├── adapter/out/
│   ├── agent-output/         # Agent OS finalized-output sinks
│   ├── agent-runtime/        # Agent OS runtime handlers
│   ├── automation/           # operation-alert adapter
│   ├── gemini/               # Gemini text/media/vision adapters
│   ├── image-fetch/          # guarded remote image fetch adapter
│   ├── repository/           # reconstructed Prisma repository/query adapters
│   ├── prisma/               # legacy thumbnail persistence/query helpers
│   └── wing/                 # Wing automation adapter
├── application/
│   ├── port/in/              # inbound ports exposed to other domains
│   ├── port/out/             # provider/repository/runtime/sink ports
│   └── service/              # use-case orchestration
├── domain/                   # pure schemas, prompts, policy helpers
└── mapper/                   # row/DTO/domain mapping
```

## Owned Surfaces

- Image edit: `POST /api/image-ai/edit`
- Text transform: `POST /api/text-ai/transform`
- Detail-page generation and editor APIs: `/api/ai/detail-page/*`
- Generated content archive: `/api/ai/content-archive/*`
- Content asset library: `/api/ai/content-assets`
- Thumbnail editor/generation APIs: `/api/thumbnail-editor/*`
- Render, analysis, tracking, Wing sync routes for AI-assisted product media

## Main Data Models

- `ContentWorkspace` is the product-pipeline content/version workspace.
- `ContentGeneration` is the generated content ledger for detail pages and
  generated images.
- `ContentGenerationGroup` is the transitional archive/media grouping used by
  legacy archive queries and reruns.
- `ContentGenerationSource` records provenance from sourcing candidates, input
  assets, or other generations.
- `DetailPageArtifact` is the editable detail-page identity.
- `DetailPageRevision` is the append-only edited HTML/version record.
- `ContentAsset` stores reusable media in a workspace group.
- `ContentGenerationAssetUsage` stores the current asset usage set for one
  generation.
- `ThumbnailGeneration` is the thumbnail generation ledger.

## Agent OS Flow

Detail-page and thumbnail generation are asynchronous:

```text
HTTP/service request
  -> create ContentGeneration or ThumbnailGeneration ledger
  -> AGENT_RUNNER_PORT.runByType(...)
  -> runtime handler performs provider/media work
  -> bridge handles agent.run.finalized
  -> sink validates and projects output into domain rows
```

Runtime handlers return validated output and do not update AI domain tables.
Bridges filter finalized Agent OS events by `agentType`. Sinks own the
`ContentGeneration` / `ThumbnailGeneration` terminal projection, generated
asset usage, `DetailPageArtifact` creation, and alert closure.

Sinks are idempotent: replaying a terminal row is a no-op. Reconcile services
reuse the same schema + sink path for Agent OS runs that completed while the
hot-path listener was unavailable.

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
- New editor saves must not write edited HTML back to
  `ContentGeneration.editedHtml` or `MasterProduct.draftContent`.

## Cross-Domain Ports

- Sourcing calls AI through `AI_WORKSPACE_ARCHIVE_PORT`,
  `PRODUCT_GENERATION_AI_TRIGGER_PORT`, and
  `POST_PROMOTION_AI_TRIGGER_PORT`.
- AI uses `AI_OPERATION_ALERT_PORT` for operation-alert lifecycle writes.
- AI generation services delegate Agent OS work through `AGENT_RUNNER_PORT`.
- Provider/media/fetch/storage behavior belongs behind the relevant
  `application/port/out/*` contract.

## Boundary Rules

- `domain/` is pure: no NestJS, Prisma, provider SDKs, filesystem, Agent OS, or
  HTTP dependencies.
- Reconstructed application services depend on ports, not concrete
  `adapter/out/**` implementations.
- Image edit, thumbnail generation, and detail-page generation must delegate
  through Agent OS; controllers do not call image providers directly.
- Gemini/model selection is explicit. Missing model/env is an error, not a
  fallback.
- Detail-page media prompt and image-selection wording lives in
  `domain/detail-page-media-prompts.ts`.

## Transitional Exceptions

These are known same-domain shortcuts. Do not grow them without replacing or
compacting the exception.

- Thumbnail analysis/auto/generation/recompose/tracking/Wing services still use
  legacy Prisma persistence/query helpers.
- Thumbnail vision/compliance services still depend on the Gemini thumbnail
  vision adapter.
- Thumbnail reference warm-up and some image-fetch paths still use concrete
  adapters.
- `thumbnail-editor-ai.service.ts` still owns inline Gemini image generation.
- `render-image.controller.ts` still owns inline Puppeteer/filesystem rendering.
- Coupang image sync keeps an in-memory job map and local Wing scrape fallback.
