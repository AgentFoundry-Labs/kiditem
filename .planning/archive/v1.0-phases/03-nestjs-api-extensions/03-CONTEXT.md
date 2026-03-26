# Phase 3: NestJS API Extensions - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Add three endpoints to the products module: PUT draft-content (save edits), extended GET preview (serve from draftContent), and POST trigger-image-generation (create agent task with snapshot). No new NestJS modules needed — extend existing products module.

</domain>

<decisions>
## Implementation Decisions

### draft-content Save Strategy
- **D-01:** PUT /api/products/:id/draft-content does a FULL REPLACEMENT of the draftContent column. Frontend always sends the complete draftContent object. No partial merge, no deep merge. Simplest implementation, zero merge bugs.
- **D-02:** The endpoint validates that the product exists, then overwrites `draftContent` with the request body. No field-level validation — the frontend is trusted to send valid DetailPageData-compatible JSON.

### Preview Endpoint Priority
- **D-03:** GET /api/products/:id/preview returns data with priority: `processedData > draftContent > rawData`. If processedData exists (images generated), show that. If only draftContent (Step 1 done, user editing), show draft with original images. If neither, show rawData.
- **D-04:** Template field: return `'bold-vertical'` when processedData OR draftContent exists, `null` when only rawData.

### Image Generation Trigger
- **D-05:** POST /api/products/:id/trigger-image-generation reads the CURRENT draftContent from DB, creates an agent_task with `{ agentType: 'content', input: { productId, generation_mode: 'image', draftContent: <full snapshot> } }`. The snapshot is taken at trigger time — this is the race-condition-safe design from Phase 2 D-06.
- **D-06:** The endpoint sets `status='processing'` and `pipelineStep='images_generating'` on the product row before returning the task ID. Frontend polls the existing GET /api/products/:id for status changes.

### Claude's Discretion
- Error handling patterns (NotFoundException, BadRequestException usage)
- Whether to add DTO classes or use Record<string, unknown> (follow existing pattern)
- Response shape for trigger endpoint (task ID format)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### NestJS Products Module
- `apps/server/src/products/products.controller.ts` — Existing controller to extend (GET :id/preview to modify)
- `apps/server/src/products/products.service.ts` — Service with Prisma queries
- `apps/server/src/products/products.module.ts` — Module registration
- `apps/server/CLAUDE.md` — NestJS patterns, routing rules, domain module conventions

### Agent Tasks Module
- `apps/server/src/agent-tasks/agent-tasks.service.ts` — Existing task creation with pg_notify pattern
- `apps/server/src/agent-tasks/agent-tasks.controller.ts` — POST /api/agent-tasks reference

### Schema
- `prisma/schema.prisma` — Product model with draftContent, pipelineStep (Phase 1 output)

### Project Rules
- `CLAUDE.md` — API 경로에 /v1/ 금지, 도메인 모듈 자기 완결

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GET :id/preview` already exists — modify to add draftContent priority
- `findOne(id)` service method — reuse for product lookup
- `PrismaService` global injection — direct Prisma calls for new operations
- `agent-tasks` module has task creation + `pg_notify` pattern

### Established Patterns
- Controllers use `@Controller('products')` → routes at `/api/products/*`
- Services use `this.prisma.product.findUnique/update/etc.`
- Error handling: NotFoundException, BadRequestException, InternalServerErrorException
- No DTO classes — `Record<string, unknown>` and `@Body()` directly
- No validation pipes — manual validation in service layer

### Integration Points
- Frontend calls these endpoints from `/sourcing/[id]/editor` page
- Python agents receive tasks via `agent_tasks` table + LISTEN/NOTIFY
- `pg_notify('new_agent_task', taskId)` wakes the Python runner

</code_context>

<specifics>
## Specific Ideas

No specific requirements — follows existing NestJS patterns exactly.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-nestjs-api-extensions*
*Context gathered: 2026-03-26*
