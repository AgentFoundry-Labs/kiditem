Consult this document first instead of relying on memorized knowledge.

# web/rocket-orders - Coupang Rocket PO Confirmation

`app/(orders)/rocket-orders/` owns the operator UI for Coupang Rocket purchase
orders: reading PO summaries from the order-collector extension, previewing
confirm quantities through backend inventory logic, generating Coupang Excel
files, and keeping a local browser history of generated files.

## Folder Map

```text
rocket-orders/
├── page.tsx
├── components/
│   ├── RocketConfirmPanel.tsx
│   ├── RocketConfirmFileList.tsx
│   ├── RocketWeekCalendar.tsx
│   ├── RocketMonthCalendar.tsx
│   └── RocketOrdersChart.tsx
└── lib/
    ├── rocket-confirm-api.ts
    └── rocket-confirm-file-store.ts
```

## Owned Surfaces

- PO list query by ETA range and Coupang Rocket status
- Week, month, and chart summaries over extension-returned PO rows
- PO row collection for confirm-preview and confirm-generate workflows
- Manual confirm quantity review before Excel download
- Local IndexedDB file history for generated Rocket confirm files

## Data Flow

```text
order-collector extension
  -> listRocketPos / collectRocketPoRows
  -> /api/orders/rocket/confirm-preview
  -> /api/orders/rocket/confirm-generate or confirm-fill
  -> browser download + local IndexedDB history
```

## State Rules

- `page.tsx` keeps date/status/view/open-row state local.
- The automatic PO list query is extension-backed and renders local errors, so
  it uses `meta: { suppressGlobalErrorToast: true }`.
- Use `apiClient.fetchRaw()` for Excel blob responses and check `res.ok`
  before reading the blob.
- `rocket-confirm-file-store.ts` is browser-only and must no-op when IndexedDB
  is unavailable.
- Keep shortage reason labels aligned with the backend-generated Coupang form.

## Boundary Rules

- Do not call Coupang supplier pages directly from the web app. Collection goes
  through `extensions/order-collector` capabilities.
- Do not trust extension-collected quantities for final confirm calculation;
  backend preview/generate endpoints own inventory matching.
- Do not move generated-file history into server persistence without a scoped
  data model and retention plan.
- Do not show the generic global query toast for expected extension-availability
  errors on the initial page render.

## Verification

```bash
npm run build --workspace=apps/web
npm exec --workspace=apps/web vitest -- run src/components/providers/__tests__/query-client.spec.ts
```
