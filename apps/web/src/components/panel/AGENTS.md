Consult this document first instead of relying on memorized knowledge.

# web/components/panel - Live Operations Panel

`components/panel/` owns the global slide-out operations panel, alert rows,
task promotion UI, panel store, SSE client, stream hook, and recovery helpers.
It is the only frontend SSE exception documented for `apps/web`.

## Folder Map

```text
panel/
├── PanelSheet.tsx
├── PanelAlertRow.tsx
├── PanelItemRow.tsx
├── PromoteToTaskModal.tsx
├── hooks/
└── lib/
    ├── panel-sse-client.ts
    ├── panel-store.ts
    └── panel-recovery.ts
```

## Data Flow

```text
PanelSseClient
  -> /api/panel/stream
  -> panel-store
  -> panel rows and sheet UI
fallback/recovery
  -> /api/panel/snapshot, /api/panel/backfill
```

## State Rules

- `PanelSseClient` uses `fetchEventSource` with `credentials: 'include'` and an
  Authorization header when a Supabase session token is available.
- Parse stream messages with `PanelEventSchema` before writing to panel state.
- Preserve `last-event-id` behavior when changing reconnect/backfill logic.
- Dismiss/promote/recovery mutations use `apiClient` and invalidate or update
  panel state through the panel store.

## Boundary Rules

- Do not add SSE outside Panel without a scoped plan and app-level instruction
  update.
- Do not replace stream fallback with silent failure; snapshot/backfill behavior
  protects operators from stale panel state.
- Do not import route-local APIs into panel components.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/components/panel
npm run build --workspace=apps/web
```
