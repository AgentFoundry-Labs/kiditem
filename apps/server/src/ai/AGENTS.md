# ai — Media AI + Agent Delegation

AI owns image/text/detail-page/thumbnail generation surfaces. Product-bound
image work is asynchronous through Agent OS; small text transforms may call the
configured text-completion port directly.

Detail-page media, provider calls, Agent OS runtime handlers, bridges, and sinks
follow the hexagonal layout below. Thumbnail legacy surfaces remain listed under
Transitional Exceptions and must not grow without removing or reconstructing an
exception.

## Layout

```
ai/
├── ai.module.ts
├── adapter/in/http/          # controllers + class-validator DTOs
├── adapter/out/
│   ├── agent-output/         # sink adapters
│   ├── agent-runtime/        # runtime handlers registered with Agent OS
│   ├── gemini/               # Gemini text/media/vision adapters
│   ├── image-fetch/          # HTTP image fetch guard adapter
│   ├── prisma/               # legacy thumbnail persistence/query adapters
│   └── wing/                 # Wing automation adapter
├── application/
│   ├── port/out/             # text/media/fetch/storage/wing/sink ports
│   └── service/              # orchestration services
├── domain/                   # pure prompt builders, schemas, policies
└── mapper/
```

## Route Modes

| Surface | Mode | Notes |
|---|---|---|
| `POST /api/image-ai/edit` | async Agent OS | returns request/run id for polling |
| `POST /api/text-ai/transform` | sync | `TEXT_COMPLETION_PORT` only |
| `POST /api/ai/detail-page/generate` with `productId` | async Agent OS | creates product-bound `ContentGeneration` ledger |
| `POST /api/ai/detail-page/generate` without `productId` | async Agent OS | creates standalone `ContentGeneration` ledger inside a `ContentGenerationGroup` |
| `GET /api/ai/content-archive/workspaces` | read model | product-content workspace index grouped by product or unlinked generation group |
| `GET /api/ai/content-archive/products/:productId` | read model | generated detail-page/image rows for one product workspace |
| `DELETE /api/ai/content-archive/products/:productId` | mutation | deletes generated content rows for one product workspace; does not delete `MasterProduct` |
| `GET /api/ai/content-archive/groups/:groupId` | read model | generated rows for one unlinked workspace |
| `DELETE /api/ai/content-archive/groups/:groupId` | mutation | deletes generated content rows for one unlinked workspace and its empty group row |
| `POST /api/ai/content-archive/groups/:groupId/attach-product` | mutation | attaches all group generations to a MasterProduct by setting `ContentGeneration.masterId` |
| `POST /api/ai/content-archive/:generationId/rerun` | async Agent OS | creates a same-input rerun in the explicit generation group |
| `GET /api/ai/content-archive/sourcing/:candidateId` | read model | sourcing-candidate provenance links into produced content |
| `GET /api/ai/content-assets` | read model | lists reusable content image assets |
| `POST /api/thumbnail-editor/generate` with `productId` | async Agent OS | creates `ThumbnailGeneration` ledger |
| `POST /api/thumbnail-editor/generate` without `productId` | sync fallback | preview/test only |
| `POST /api/*/reconcile-stuck` | admin recovery | replays terminal Agent OS runs through the same sink |
| render/analysis/tracking/Wing sync routes | mixed legacy | keep organization scope and DTO validation |

## Hard Rules

- Image edit, thumbnail generation, and detail-page generation delegate to
  `AGENT_RUNNER_PORT.runByType(...)`. Do not call image providers directly from
  HTTP controllers.
- Gemini/model selection is explicit. Missing model/env is an error; no
  `model || default` fallback.
- HTTP DTOs live under `adapter/in/http/dto/`. Controllers do not use `as any`.
- `domain/` is pure: no NestJS, Prisma, provider SDK, filesystem, Agent OS, or
  HTTP dependencies.
- Reconstructed application services depend on ports in `application/port/out/*`.
  Do not add new concrete `adapter/out/**` imports to application services.
- Detail-page media calls use `DETAIL_PAGE_MEDIA_PORT`; generic fetch/storage
  reuse `IMAGE_FETCH_PORT` and `IMAGE_STORAGE_PORT`.
- Detail-page media prompt text and image-selection wording live in
  `domain/detail-page-media-prompts.ts` with direct domain tests.
- `DetailPageAiService` is a facade. Put new behavior in
  `DetailPageGenerationService`, `DetailPagePrefillService`, or
  `DetailPageQueryService`.
- When generation controls change, check the whole contract chain:
  shared tuple/type, HTTP DTO, web payload, Agent OS input/output schema, stored
  rawInput normalizer, sink, and reconcile.

## Agent OS Output Contract

- Runtime handlers do LLM/provider work and return Zod-validated output. They do
  not update downstream domain rows.
- Bridges listen to the global `agent.run.finalized` event, filter by
  `event.agentType`, validate output, then call a sink port.
- Bridges must route invalid output to `applyFailure({ errorCode:
  'agent_output_invalid' })`; do not throw at the event-bus level.
- Sink adapters update `ContentGeneration` / `ThumbnailGeneration`, processed
  images, content assets, and alerts with `(id, organizationId)` scope.
- Sinks are idempotent. If the downstream row is already terminal, replay is a
  no-op.
- Reconcile services read terminal Agent OS runs and replay the same schema +
  sink path for rows still stuck in non-terminal state.

## Detail Page Flow

Detail-page generation:

```text
HTTP DTO
  -> DetailPageAiService facade
  -> DetailPageGenerationService creates ContentGeneration + optional ContentGenerationGroup + input ContentAsset rows + ContentGenerationSource rows + alert
  -> AGENT_RUNNER_PORT.runByType('detail_page_generate')
  -> detail-page runtime handler
  -> bridge
  -> sink READY/FAILED + generated images + generated ContentAsset rows + alert close
```

`ContentGeneration.masterId` is nullable. Product-bound runs set it to the
target `MasterProduct.id`; standalone runs leave it null and must belong to an
explicit `ContentGenerationGroup`. Same-input reruns reuse/create a group and
must not infer grouping from title or product-name similarity.

`ContentGenerationSource` stores generation-level provenance. It may point to a
sourcing candidate, Master product, input asset, or another generation. `sourceType`
belongs here in the new design. `ContentAsset.sourceType` is retained only for
legacy compatibility; active file semantics are `pipelineType`, `usageType`, and
`originType`.

Edited detail-page HTML is stored on `ContentGeneration.editedHtml`; do not
write generated editor output back into `MasterProduct.draftContent`.

`DetailPageHeroImageService` selects source images, storage keys, and prompt
inputs. `DetailPageGeminiMediaAdapter` owns GoogleGenAI response parsing and
provider-specific media/vision envelopes.

## Thumbnail Flow

Product-bound editor generation:

```text
HTTP DTO
  -> ThumbnailGenerationService.enqueueEditorGeneration
  -> AGENT_RUNNER_PORT.runByType('thumbnail_generate')
  -> thumbnail runtime handler
  -> bridge
  -> sink succeeded/failed + alert close
```

The handler may call existing thumbnail editor services, but must not write
Prisma rows directly.

## Image Edit Flow

Product-content image edits are Agent OS tool-wrapper runs executed inside the
Nest AI domain:

```text
HTTP DTO or /api/agent-os/runs
  -> ImageAiService creates ContentGeneration(contentType='image') when product/content context is provided
  -> AGENT_RUNNER_PORT.runByType('image_edit')
  -> image-edit runtime handler
  -> IMAGE_EDIT_MEDIA_PORT (Gemini image adapter)
  -> Storage URL output { image_url }
  -> bridge
  -> sink READY/FAILED + generated ContentAsset output
```

The runtime uses `ctx.model` from Agent OS as the provider model. Do not read
`AI_IMAGE_MODEL` or call Python for `image_edit`; missing `ctx.model` is an
explicit runtime error.

## Post-Promotion Trigger

The sourcing-candidate split (issue #192) introduces an inbound port for
post-promotion AI generation:

- Port: `POST_PROMOTION_AI_TRIGGER_PORT` in `application/port/in/`
- Service: `PostPromotionAiService` — mirrors
  `DetailPageGenerationService.enqueueProductBoundGeneration` and
  `ThumbnailGenerationJobService.enqueueEditorGeneration` so the Agent OS
  bridge + sink path treats post-promotion runs identically to
  user-initiated ones.
- Fetches the master row + `MasterProductImage` gallery from Prisma to
  build the agent payloads (`raw.rawTitle/rawCategory/rawDescription/imageUrls`
  for detail-page, `mode='edit' + inputs[]` for thumbnail).
- Creates `ContentGeneration` (`status='PROCESSING'`) and
  `ThumbnailGeneration` (`status='pending'`) rows up front so the sink has
  a writable target. `sourceResourceId` on the Agent OS request points at
  the gen row id, never the master id.
- AI-domain-owned defaults live as service constants:
  `templateId='kids-playful'`, `heroImageMode='llm-pick'`,
  `ageGroup='age-8-plus'`, `detailImageCount='auto'`, thumbnail
  `mode='edit'` + `editCase='single'`, `method='generate'`.
- `sourceType` uses dedicated origins (`AI_AGENT_SOURCE_TYPES.POST_PROMOTION_*`)
  so operators/panel filters can distinguish auto-fired runs from
  user-initiated ones. `sourceResourceType` still uses the existing gen
  row table names (`content_generation` / `thumbnail_generation`).
- Fire-and-forget: detail-page and thumbnail are independent
  try/catch blocks. On `{ok:false}` or exception, the gen row flips to
  `FAILED`/`failed`, the operation alert is failed, and the error is
  logged — the method always resolves void. Master-not-found logs an
  error and returns without creating rows or alerts.
- Called by sourcing's `SourcingAgentGatewayAdapter.notifyPromoted`

## ContentGeneration Content Contract

`ContentGeneration` is the produced content source of truth for archive work
items (`contentType='detail_page' | 'image'`). Its `masterId` is optional target
attachment, not ownership of the work product. `ContentGenerationGroup` is
same-input lineage and the top-level workspace identity for product-less
generated content.

`ContentAsset` records generated/editable media files used by a generation:
`usageType` answers input/output/reference, `originType` answers manual upload /
external URL / generated / master image / source candidate image, and
`pipelineType` answers which AI workflow consumed or produced the file.
Selecting an asset for the product gallery copies/adopts it into
`MasterProductImage`; adoption state does not live in the archive card.

`ContentGeneration` is not a sourcing-candidate polymorphic target. Sourcing
candidate provenance is represented by `ContentGenerationSource` rows and read
through AI-domain archive APIs.

## Transitional Exceptions

These are known same-domain shortcuts. Do not add to this list without removing
or compacting a nearby exception.

- Thumbnail analysis/auto/generation/recompose/tracking/Wing services still call
  Prisma persistence/query helpers directly.
- Thumbnail vision/compliance services still depend on the Gemini thumbnail
  vision adapter.
- Thumbnail reference warm-up and some image-fetch paths still use concrete
  adapters.
- `thumbnail-editor-ai.service.ts` still owns inline Gemini image generation.
- `render-image.controller.ts` still owns inline Puppeteer/filesystem rendering.
- Coupang image sync keeps an in-memory job map and local Wing scrape fallback.

## Verification

For AI/domain reconstruction PRs:

```bash
npm exec --workspace=apps/server -- vitest run src/ai
npm run build --workspace=apps/server
npm run dev:server
```

Add `npm run test:integration` when touching Agent OS sink/reconcile behavior,
stored JSON compatibility, organization scope, or database transaction paths.
