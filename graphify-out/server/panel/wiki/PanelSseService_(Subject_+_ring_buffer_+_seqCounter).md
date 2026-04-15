# PanelSseService (Subject + ring buffer + seqCounter)

> God node · 12 connections · `apps/server/src/panel/events/panel-sse.service.ts`

## Connections by Relation

### calls
- [[PanelController (@Controller('panel'))]] `EXTRACTED`
- [[@nestjs/event-emitter (EventEmitter2 bus)]] `EXTRACTED`
- [[rxjs Subject + Observable (live stream)]] `EXTRACTED`

### implements
- [[PanelSseService.handleUpsert (@OnEvent UPSERT)]] `EXTRACTED`
- [[PanelSseService.handleDismiss (@OnEvent DISMISS)]] `EXTRACTED`
- [[PanelSseService.getStream (filter by companyId)]] `EXTRACTED`
- [[PanelSseService.replayAfter (Last-Event-ID resume)]] `EXTRACTED`
- [[Server-side companyId strip (internal routing only, not on wire)]] `EXTRACTED`

### rationale_for
- [[Rule: Panel assumes single server instance (multi → pg LISTEN/Redis)]] `EXTRACTED`

### references
- [[PanelModule (NestJS module)]] `EXTRACTED`
- [[seqCounter (monotonic, increments per upsert/dismiss)]] `EXTRACTED`
- [[ringBuffer (Map companyId -> events, RING_BUFFER_SIZE=100)]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*