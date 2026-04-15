# SSE Stream & Ring Buffer

> 10 nodes · cohesion 0.24

## Key Concepts

- **PanelSseService (Subject + ring buffer + seqCounter)** (12 connections) — `apps/server/src/panel/events/panel-sse.service.ts`
- **PanelController.stream (@Sse 'stream')** (5 connections) — `apps/server/src/panel/panel.controller.ts`
- **PanelSseService.getStream (filter by companyId)** (2 connections) — `apps/server/src/panel/events/panel-sse.service.ts`
- **PanelSseService.replayAfter (Last-Event-ID resume)** (2 connections) — `apps/server/src/panel/events/panel-sse.service.ts`
- **seqCounter (monotonic, increments per upsert/dismiss)** (2 connections) — `apps/server/src/panel/events/panel-sse.service.ts`
- **@nestjs/event-emitter (EventEmitter2 bus)** (1 connections) — `apps/server/src/panel/events/panel-sse.service.ts`
- **ringBuffer (Map companyId -> events, RING_BUFFER_SIZE=100)** (1 connections) — `apps/server/src/panel/events/panel-sse.service.ts`
- **rxjs Subject + Observable (live stream)** (1 connections) — `apps/server/src/panel/events/panel-sse.service.ts`
- **Server-side companyId strip (internal routing only, not on wire)** (1 connections) — `apps/server/src/panel/events/panel-sse.service.ts`
- **Rule: Panel assumes single server instance (multi → pg LISTEN/Redis)** (1 connections) — `apps/server/CLAUDE.md`

## Relationships

- No strong cross-community connections detected

## Source Files

- `apps/server/CLAUDE.md`
- `apps/server/src/panel/events/panel-sse.service.ts`
- `apps/server/src/panel/panel.controller.ts`

## Audit Trail

- EXTRACTED: 28 (100%)
- INFERRED: 0 (0%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*