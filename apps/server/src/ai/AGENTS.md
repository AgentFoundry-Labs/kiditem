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
| `POST /api/ai/detail-page/generate` with `productId` | async Agent OS | creates `ContentGeneration` ledger |
| `POST /api/ai/detail-page/generate` without `productId` | sync fallback | preview/test only; no ledger/reconcile |
| `POST /api/thumbnail-editor/generate` with `productId` | async Agent OS | creates `ThumbnailGeneration` ledger |
| `POST /api/thumbnail-editor/generate` without `productId` | sync fallback | preview/test only |
| `POST /api/*/reconcile-stuck` | admin recovery | replays terminal Agent OS runs through the same sink |
| render/analysis/tracking/Wing sync routes | mixed legacy | keep organization scope and DTO validation |

## Hard Rules

- Image edit and product-bound thumbnail/detail generation delegate to
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
  images, and alerts with `(id, organizationId)` scope.
- Sinks are idempotent. If the downstream row is already terminal, replay is a
  no-op.
- Reconcile services read terminal Agent OS runs and replay the same schema +
  sink path for rows still stuck in non-terminal state.

## Detail Page Flow

Product-bound generation:

```text
HTTP DTO
  -> DetailPageAiService facade
  -> DetailPageGenerationService creates ContentGeneration + alert
  -> AGENT_RUNNER_PORT.runByType('detail_page_generate')
  -> detail-page runtime handler
  -> bridge
  -> sink READY/FAILED + generated images + alert close
```

Standalone generation (`productId` missing) uses `TEXT_COMPLETION_PORT` directly
and intentionally bypasses `ContentGeneration`, Agent OS, and reconcile.

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

## Post-Promotion Trigger

The sourcing-candidate split (issue #192) introduces an inbound port for
post-promotion AI generation:

- Port: `POST_PROMOTION_AI_TRIGGER_PORT` in `application/port/in/`
- Service: `PostPromotionAiService` — enqueues `detail_page_generate` +
  `thumbnail_generate` with AI-domain-owned defaults
  (`templateId='kids-playful'`, `mode='full'`)
- Fire-and-forget: individual agent enqueue failures logged but not thrown
- Called by sourcing's `SourcingAgentGatewayAdapter.notifyPromoted` (Phase 2)

## ContentGeneration Master-Only Contract

`ContentGeneration` and `ThumbnailGeneration` are master-only by contract
(master_id FK is required; no polymorphic candidate target). The
sourcing-candidate split design (issue #192) explicitly rejected
polymorphism over implicit assumptions. If future requirements need
candidate-stage AI preview, that would require a new
`CandidateContentGeneration` table — not a polymorphic discriminator on
`ContentGeneration`.

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
