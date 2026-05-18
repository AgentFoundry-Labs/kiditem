# panel-event — Live Ops SSE Projection Adapter

`src/automation/adapter/out/panel-event/` subscribes to the EventEmitter2 bus
and multiplexes workflow, image, and alert updates over SSE. It is a projection
adapter, not a business owner.

## Folder Map

```text
automation/
├── adapter/in/http/panel.controller.ts   # SSE stream, snapshot, backfill
├── adapter/out/panel-event/
│   ├── panel.service.ts                  # snapshot/backfill projections
│   ├── panel-events.ts                   # PANEL_EVENTS payloads
│   └── panel-sse.service.ts              # ring buffer + seq + multiplex
└── mapper/panel-event/
    ├── workflow.mapper.ts
    ├── image.mapper.ts
    ├── alert.mapper.ts
    ├── workflow-run.mapper.ts
    └── types.ts
```

## Owned Surfaces

- `@Sse('stream')`
- `GET /api/panel/snapshot`
- `GET /api/panel/backfill`
- Panel event constants and payload mapping

## Projection Flow

```text
owner-domain event
  -> PANEL_EVENTS.UPSERT / DISMISS
  -> panel-sse ring buffer
  -> user-filtered SSE stream
  -> snapshot/backfill read models as needed
```

Panel reads `workflowRun`, `thumbnailGeneration`, and `alert` rows with
organization scope. It does not own the rows it displays.

## Visibility Rules

- Workflow visibility uses the `User-WorkflowRun` relation plus actor user.
- Alert rows are organization-scoped; personal work is handled after
  `Alert -> ActionTask` promotion.
- Same organization does not imply the same panel stream for every user.
- `Alert.href` is the producer-owned deep link; panel renders it as-is and does
  not infer fallback links.

## Boundary Rules

- No domain mutation from panel code.
- Do not add a new event source unless the owner domain emits the event and
  owns the business contract.
- No LLM/provider/fetch/filesystem work.
- Do not create a separate agent inbox; user-facing signals project to `Alert`
  and, when needed, `ActionTask`.

## Transitional Exceptions

- `PanelSseService` ring buffer is in-process. Multi-instance production needs
  PG `LISTEN/NOTIFY` or Redis pub-sub and a small SSE bus module in the same PR.
