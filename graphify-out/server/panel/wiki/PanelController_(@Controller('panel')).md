# PanelController (@Controller('panel'))

> God node · 10 connections · `apps/server/src/panel/panel.controller.ts`

## Connections by Relation

### calls
- [[PanelSseService (Subject + ring buffer + seqCounter)]] `EXTRACTED`
- [[PanelService (snapshot + backfill)]] `EXTRACTED`
- [[@CurrentCompany decorator (ADR-0006)]] `EXTRACTED`
- [[@CurrentUser decorator]] `EXTRACTED`

### implements
- [[PanelController.stream (@Sse 'stream')]] `EXTRACTED`
- [[PanelController.backfill (@Get 'backfill')]] `EXTRACTED`
- [[PanelController.snapshot (@Get 'snapshot')]] `EXTRACTED`

### rationale_for
- [[Rule: companyId via @CurrentCompany() decorator only (ADR-0006)]] `EXTRACTED`
- [[Rule: throw HttpException, GlobalExceptionFilter handles]] `INFERRED`

### references
- [[PanelModule (NestJS module)]] `EXTRACTED`

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*