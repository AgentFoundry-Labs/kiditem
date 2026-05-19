# web/workflows — Workflow List + Mutation Hooks

`app/(automation)/workflows/` owns the workflow list UI, workflow activation,
and workflow deletion. The page is intentionally thin; query/mutation behavior
lives in route-local hooks and API wrappers.

## Folder Map

```text
workflows/
├── page.tsx                    # list + filter composition
├── components/
│   └── MyWorkflowsSection.tsx  # single workflow-list section
├── hooks/
│   └── useWorkflows.ts         # list/toggle/delete hook exports
└── lib/
    ├── workflow-api.ts         # apiClient wrappers
    └── workflow-types.ts       # WorkflowRunWithSteps
```

## Owned Surfaces

- Workflow list rendering
- Activate/deactivate mutation
- Delete mutation
- Local filter state

## API Hooks

| Hook | Query key | Endpoint |
|---|---|---|
| `useWorkflows()` | `queryKeys.workflows.list()` | `GET /api/workflows` |
| `useToggleWorkflow()` | mutation | `PUT /api/workflows/:id` |
| `useDeleteWorkflow()` | mutation | `DELETE /api/workflows/:id` |

## State Rules

- All mutations invalidate `queryKeys.workflows.all`.
- `useWorkflows(options)` forwards `UseQueryOptions` so callers can override
  `enabled`, `staleTime`, or future polling behavior.
- `organizationId` is never sent by the client; backend
  `@CurrentOrganization()` owns tenant scope.
- Filter state is UI-only and does not affect the API call.
- The route is a static list today; do not add polling without a reason and
  query-key design.

## Boundary Rules

- Use route-local hooks; do not place inline `useQuery` in `page.tsx`.
- Do not transform workflow server data on the client without updating the
  shared workflow contract.
- Response type changes should update `@kiditem/shared/workflow`,
  `workflow-types.ts`, and page rendering together.
