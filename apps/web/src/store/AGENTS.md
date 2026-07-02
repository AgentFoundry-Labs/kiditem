Consult this document first instead of relying on memorized knowledge.

# web/store - Shared Client UI State

`src/store/` owns small global client-only UI state. It is currently a Zustand
store for app shell toggles, editor dirty state, and the global confirm dialog.
It must not become a server-state cache.

## Owned State

- Sidebar open/closed state
- Editor dirty flag
- Global confirm dialog state and callbacks

## State Rules

- Use Zustand only for client UI state that must cross route/component
  boundaries.
- Server data belongs in React Query, keyed through `queryKeys`.
- Keep confirm dialog callbacks short and side-effect ownership at the call
  site.
- Do not persist this store unless the UX explicitly requires cross-refresh
  behavior.

## Boundary Rules

- Do not add order, product, inventory, finance, or auth response data here.
- Do not put generated files, extension rows, or API responses in Zustand.
- Do not use the store to bypass provider-owned auth/query behavior.
