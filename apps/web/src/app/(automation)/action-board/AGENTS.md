Consult this document first instead of relying on memorized knowledge.

# web/action-board - Action Task Operations

`action-board/` owns the action task work surface: scoped task lists, columns,
claim/unclaim, notes, status updates, and execution triggers.

## Folder Map

```text
action-board/
├── page.tsx
├── components/
├── hooks/
└── lib/
```

## State Rules

- Use `useActionBoardWorkflow()` for task reads and mutations.
- Task reads use `queryKeys.actionTasks.list(scope)`.
- Mutations invalidate `queryKeys.actionTasks.all`.
- Keep column definitions and action helpers in route-local `lib/`.

## Boundary Rules

- Do not execute arbitrary workflow or agent logic in the browser. Use
  `/api/action-tasks/:id/execute`.
- Do not import panel store internals here; panel integration goes through
  backend task/alert APIs.
- Do not add polling/streaming without documenting the query key and backend
  event source.

## Verification

```bash
npm run build --workspace=apps/web
```
