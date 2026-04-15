# Controller & Module Wiring

> 9 nodes · cohesion 0.25

## Key Concepts

- **PanelController (@Controller('panel'))** (10 connections) — `apps/server/src/panel/panel.controller.ts`
- **PanelModule (NestJS module)** (5 connections) — `apps/server/src/panel/panel.module.ts`
- **@CurrentCompany decorator (ADR-0006)** (2 connections) — `apps/server/src/panel/panel.controller.ts`
- **PanelController.snapshot (@Get 'snapshot')** (2 connections) — `apps/server/src/panel/panel.controller.ts`
- **Rule: companyId via @CurrentCompany() decorator only (ADR-0006)** (2 connections) — `apps/server/CLAUDE.md`
- **@CurrentUser decorator** (1 connections) — `apps/server/src/panel/panel.controller.ts`
- **PanelModule exports PanelSseService (PR2 cross-domain emit)** (1 connections) — `apps/server/src/panel/panel.module.ts`
- **Rule: EventEmitterModule.forRoot() in AppModule only (CRITICAL #7)** (1 connections) — `apps/server/src/panel/panel.module.ts`
- **Rule: throw HttpException, GlobalExceptionFilter handles** (1 connections) — `apps/server/CLAUDE.md`

## Relationships

- No strong cross-community connections detected

## Source Files

- `apps/server/CLAUDE.md`
- `apps/server/src/panel/panel.controller.ts`
- `apps/server/src/panel/panel.module.ts`

## Audit Trail

- EXTRACTED: 23 (92%)
- INFERRED: 2 (8%)
- AMBIGUOUS: 0 (0%)

---

*Part of the graphify knowledge wiki. See [[index]] to navigate.*