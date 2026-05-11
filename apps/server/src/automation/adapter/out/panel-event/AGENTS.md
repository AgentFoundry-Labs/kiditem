# panel-event — Live Ops SSE Projection Adapter

Panel subscribes to the EventEmitter2 bus and multiplexes workflow, image, and
alert updates over SSE. It is a projection adapter, not a business owner.

## Hard Bans

- No domain mutation from panel. `WorkflowRun`, `ThumbnailGeneration`, and
  `Alert` are read-only projections here.
- Do not add a new source unless the owner domain emits the event and owns the
  business contract.
- No `prisma.<model>.update/create/delete` in panel code.
- Do not create a separate Agent inbox. Agent user-facing signals project to
  `Alert` and, when needed, `ActionTask`.

## Layout

```text
automation/
  adapter/in/http/panel.controller.ts      SSE stream, snapshot, backfill
  adapter/out/panel-event/
    panel.service.ts                       snapshot/backfill projections
    panel-events.ts                        PANEL_EVENTS payloads
    panel-sse.service.ts                   ring buffer + seq + multiplex
  mapper/panel-event/
    workflow.mapper.ts
    image.mapper.ts
    alert.mapper.ts
    workflow-run.mapper.ts
    types.ts
```

## Entrypoints And Dependencies

- HTTP: `@Sse('stream')`, `GET /api/panel/snapshot`,
  `GET /api/panel/backfill`; always use `@CurrentOrganization()` and
  `@CurrentUser()`.
- Events: `PANEL_EVENTS.UPSERT` / `DISMISS` from workflow, rules, alerts, and
  thumbnail auto flows.
- DB reads: organization-scoped read-only joins for `workflowRun`,
  `thumbnailGeneration`, and `alert`.
- No LLM/provider/fetch/filesystem work.

## Visibility

Panel visibility is user-filtered inside the organization:

- Workflow visibility uses the `User-WorkflowRun` relation plus actor user.
- `Alert` rows are organization-scoped; personal work is handled after
  `Alert -> ActionTask` promotion.
- Same organization does not imply the same panel stream for every user.

## Alert Href Contract

`Alert.href` is the producer-owned deep link. Panel renders it as-is and does
not infer fallback links from `targetType` / `targetId`.

- In-progress operations link to status/cancel/retry context.
- Success links to the result surface.
- Failure links to the failure detail or retry start.
- Signal alerts link to the screen where the user can resolve the problem.
- If final result URL is unknown at `start()`, write a status URL first and
  patch `href` from `succeed()` / `fail()`.

## Single-Instance Assumption

`PanelSseService` ring buffer is in-process. Multi-instance production requires
PG `LISTEN/NOTIFY` or Redis pub-sub and should introduce a small SSE bus module
in the same PR.

## Change Map

| Change | Also update |
|---|---|
| event payload | all emitters + `panel-sse.service` + client store |
| mapper shape | `@kiditem/shared/panel` + client rendering |
| snapshot source | owner-domain contract + `panel.service.ts` backfill |
| visibility | `panel.service.ts` filters + controller user context |
