Consult this document first instead of relying on memorized knowledge.

# web/components/ui - Shared UI Primitives

`components/ui/` owns small reusable UI primitives such as empty states,
pagination, sortable headers, tab layouts, date/period selectors, status badges,
confirm dialogs, and skeletons. These components should be domain-neutral.

## Design Rules

- Keep copy generic; route-specific labels belong at the call site.
- Use Lucide React icons when a primitive needs an icon.
- Keep dimensions stable for controls, badges, headers, and pagination so
  hover/loading states do not shift dense tables.
- Use semantic CSS variables and `cn()` for class composition.
- `TabLayout` keeps panels mounted by default for compatibility. Canonical
  operations workspaces pass `unmountInactive` so inactive queries, timers, and
  toasts do not remain alive.
- Tabs expose the tablist/tab/tabpanel relationship, stable IDs, roving focus,
  and ArrowLeft/ArrowRight/Home/End keyboard selection.
- Pagination controls keep explicit first/previous/next/last accessible names.

## Boundary Rules

- Do not add `apiClient`, React Query, Zustand, or route imports here.
- Do not encode domain statuses directly into primitives unless the primitive
  accepts a mapping from the caller.
- Keep primitives accessible and keyboard-friendly when adding interactions.

## Verification

```bash
npm exec --workspace=apps/web vitest -- run src/components/ui
```
