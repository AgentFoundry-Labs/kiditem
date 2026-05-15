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
│   ├── port/in/              # cross-domain inbound ports exported by AiModule
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
| `GET /api/ai/content-archive/workspaces` | read model | generated content workspace index grouped by product or unlinked generation group |
| `GET /api/ai/content-archive/products/:productId` | read model | generated detail-page/image rows for one product workspace |
| `DELETE /api/ai/content-archive/products/:productId` | mutation | deletes generated content rows for one product workspace; does not delete `MasterProduct` |
| `GET /api/ai/content-archive/groups/:groupId` | read model | generated rows for one unlinked workspace |
| `DELETE /api/ai/content-archive/groups/:groupId` | mutation | deletes generated content rows for one unlinked workspace and its empty group row |
| `POST /api/ai/content-archive/groups/:groupId/attach-product` | mutation | attaches group generations/assets to a product workspace |
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
- Sourcing workspace archive requests enter AI through
  `AI_WORKSPACE_ARCHIVE_PORT`; sourcing must not update AI artifact tables
  directly.
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
  -> DetailPageGenerationService creates ContentGeneration + required ContentGenerationGroup + input ContentAsset rows + ContentGenerationSource rows + alert
  -> AGENT_RUNNER_PORT.runByType('detail_page_generate')
  -> detail-page runtime handler
  -> bridge
  -> sink READY/FAILED + DetailPageArtifact identity + generated images + generated ContentAsset rows + alert close
```

`ContentGenerationGroup` is the transitional archive/media workspace identity.
Product-bound runs use the canonical `groupType='product_workspace'` group with
`targetMasterId=<MasterProduct.id>`; standalone runs use an unlinked
`input_variation` group. `ContentGeneration.generationGroupId` is required
while the archive UI still groups workspaces through it. Same-input reruns
reuse/create the explicit group and must not infer grouping from title or
product-name similarity.

`ContentGeneration` stores request/result snapshots in `generationInput` and
`generationResult`, plus direct candidate lineage in `sourceCandidateId` when a
sourcing candidate is the primary source. Do not add generated-detail payload
columns back to the row.

On successful detail-page generation the sink creates or reuses a
`DetailPageArtifact` and writes its id to
`ContentGeneration.detailPageArtifactId`. Initial generated output still lives
in `generationResult`; editor saves append `DetailPageRevision` rows.

`ContentGenerationSource` stores generation-level provenance. It may point to a
sourcing candidate, input asset, or another generation. Keep it as the
multi-source ledger; the primary candidate shortcut belongs on
`ContentGeneration.sourceCandidateId`. Product target is the workspace group,
not a source row.

`ContentAsset` is the group library asset. Current images used by a generated
row live in `ContentGenerationAssetUsage`; saving edited detail-page HTML
replaces that usage set from the HTML `<img>` URLs.

Archive/delete of generated work is logical first: active queries filter
`isDeleted=false` on `ContentGeneration`, `DetailPageArtifact`,
`ThumbnailGeneration`, and `ContentAsset`. Object storage deletion is a separate
retention/GC concern and must first prove no active `MasterProductImage`,
`CandidateImage`, thumbnail generation image, thumbnail input, or content asset
still references the same storage key.

Editable detail-page HTML is stored as append-only `DetailPageRevision` rows;
`DetailPageArtifact.currentRevisionId` selects the active version. The
`/edited-html` API remains the compatibility endpoint, but new saves must not
write editor output to `ContentGeneration.editedHtml` or
`MasterProduct.draftContent`.

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

Generated-content image edits are Agent OS tool-wrapper runs executed inside the
Nest AI domain:

```text
HTTP DTO or /api/agent-os/runs
  -> ImageAiService enqueues image_edit with optional product/content context
  -> AGENT_RUNNER_PORT.runByType('image_edit')
  -> image-edit runtime handler
  -> IMAGE_EDIT_MEDIA_PORT (Gemini image adapter)
  -> temporary Storage URL output { image_url }
  -> editor applies the URL to the selected image only
  -> detail-page save promotes temporary edit URLs into permanent ContentAsset URLs
```

The runtime uses `ctx.model` from Agent OS as the provider model. Do not read
`AI_IMAGE_MODEL` or call Python for `image_edit`; missing `ctx.model` is an
explicit runtime error.

Image edits do not create `ContentGeneration(contentType='image')` ledgers.
Until the user saves the detail page, edit outputs are temporary storage
objects only. The edited HTML save path persists the selected-image change by
rewriting temporary URLs to permanent asset URLs and syncing
`ContentGenerationAssetUsage`.

## Post-Promotion Trigger

Post-promotion AI generation uses an inbound port:

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
items (`contentType='detail_page' | 'image'`). Ownership/target attachment is
resolved through `ContentGenerationGroup`; product-bound work lives under the
canonical product workspace group, and product-less work lives under an
unlinked group.

`ContentAsset` records reusable media files in a workspace group. Direct
uploads, generation inputs, generated images, and saved edit results all become
group assets; current usage by a generation is represented by
`ContentGenerationAssetUsage`. Selecting an asset for the product gallery
copies/adopts it into `MasterProductImage`; adoption state does not live in the
archive card.

`ContentGeneration` is not a sourcing-candidate polymorphic target. Primary
sourcing lineage is `ContentGeneration.sourceCandidateId`; additional
provenance remains in `ContentGenerationSource` rows and is read through
AI-domain archive APIs.

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
