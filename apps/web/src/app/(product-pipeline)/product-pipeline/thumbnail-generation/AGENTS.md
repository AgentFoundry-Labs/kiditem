Consult this document first instead of relying on memorized knowledge.

# web/thumbnail-generation — Generation Workspace

`app/(product-pipeline)/product-pipeline/thumbnail-generation/` owns the
standalone thumbnail generation hub and edit route. Its core contract is
use-case selection, slot-based image input, mutation-driven generation, and
immediate history sync.

## Owned Surfaces

- Standalone thumbnail generation hub
- Edit route for compliance and creative thumbnail generation
- Slot-based image source selection from uploads, generated assets, previous
  generations, and other products
- Candidate result selection, apply, skip, and history invalidation

## Generation Flow

```text
ModeShowcase / edit route
  -> mode + editCase + subject query state
  -> useGenerateThumbnail() mutation
  -> pending rows observed through shared generation list
  -> user selects candidate
  -> useApplyGeneration() or useSkipGeneration()
  -> invalidate thumbnail analysis/generation history
```

`productId`, `sourceCandidateId`, and `contentWorkspaceId` are contextual
identity for result attachment. Ownerless direct generation is allowed before
registration; workspace-entered generation should attach through
`contentWorkspaceId`.

## Payload Rules

| `editCase` | Input | Payload |
|---|---|---|
| `compose` | product + supplementary slot | `productImage`, `packagingImage`, `supplementaryLabel`, `pieceCount` |
| `color-variants` | 2-8 color images | `colorImages`, `colorCount` |
| `single` | one product slot | `productImage` |
| `creative` | product + optional reference | `productImage`, `sceneType`, `styleType`, `productDescription`, `backgroundReference` |

`sceneType === 'custom-reference'` is UI-only and is stripped before sending.
Edit mode always sends `purpose: 'compliance'`; creative sends `'quality'`.

## State Rules

- `← 용도 변경` resets `editCase`, supplementary inputs, results,
  `generationId`, and `selectedCandidateUrl`; it preserves product image/name.
- Switching edit/creative tabs preserves state.
- `colorImages` requires at least 2 images; `colorCount` is array length.
- `selectedCandidateUrl` gates apply/skip buttons.
- Subject query state uses one canonical identity:
  `productId`, `sourceCandidateId`, or `contentWorkspaceId`.
- `HubImagePickerModal` is not used in this route.

## Cross-Route Dependencies

- `@kiditem/shared` provides `ThumbnailGenerationItem`.
- `apiClient` calls `/api/thumbnail-editor/generate`, `/api/products/{id}`,
  and `/api/thumbnail-analysis/generations/*`.
- Shared thumbnail generation hooks provide select/apply/skip behavior.
- Route helpers live in `_shared/lib/product-pipeline-routes.ts` and
  `_shared/lib/thumbnail-subject.ts`.

## Boundary Rules

- Generation is API-only; do not add Canvas transforms here.
- Upload images are sent raw; do not add resize/validation without updating the
  backend DTO and route contract.
- Payload field changes require checking route request type, backend
  `thumbnail-editor.dto.ts`, and `edit/page.tsx` assembly together.
- Scene preset changes require checking `EditorControlPanel.tsx` and backend
  creative prompt handling together.

## Verification

For thumbnail-generation changes, run the narrow route suite first, then the
web build:

```bash
npm exec --workspace=apps/web vitest -- run 'src/app/(product-pipeline)/product-pipeline/thumbnail-generation'
```

Payload, polling, generated href, or scene preset changes need a focused
regression spec for the changed UI/API contract.
