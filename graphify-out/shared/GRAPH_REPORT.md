# Graph Report - packages/shared  (2026-04-14)

## Corpus Check
- Corpus is ~7,516 words - fits in a single context window. You may not need a graph.

## Summary
- 65 nodes · 46 edges · 26 communities detected
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Cluster 0 (9n)|Cluster 0 (9n)]]
- [[_COMMUNITY_Cluster 1 (8n)|Cluster 1 (8n)]]
- [[_COMMUNITY_Cluster 2 (6n)|Cluster 2 (6n)]]
- [[_COMMUNITY_Cluster 3 (6n)|Cluster 3 (6n)]]
- [[_COMMUNITY_Cluster 4 (5n)|Cluster 4 (5n)]]
- [[_COMMUNITY_Cluster 5 (4n)|Cluster 5 (4n)]]
- [[_COMMUNITY_Cluster 6 (3n)|Cluster 6 (3n)]]
- [[_COMMUNITY_Cluster 7 (3n)|Cluster 7 (3n)]]
- [[_COMMUNITY_Cluster 8 (3n)|Cluster 8 (3n)]]
- [[_COMMUNITY_Cluster 9 (2n)|Cluster 9 (2n)]]
- [[_COMMUNITY_Cluster 10 (1n)|Cluster 10 (1n)]]
- [[_COMMUNITY_Cluster 11 (1n)|Cluster 11 (1n)]]
- [[_COMMUNITY_Cluster 12 (1n)|Cluster 12 (1n)]]
- [[_COMMUNITY_Cluster 13 (1n)|Cluster 13 (1n)]]
- [[_COMMUNITY_Cluster 14 (1n)|Cluster 14 (1n)]]
- [[_COMMUNITY_Cluster 15 (1n)|Cluster 15 (1n)]]
- [[_COMMUNITY_Cluster 16 (1n)|Cluster 16 (1n)]]
- [[_COMMUNITY_Cluster 17 (1n)|Cluster 17 (1n)]]
- [[_COMMUNITY_Cluster 18 (1n)|Cluster 18 (1n)]]
- [[_COMMUNITY_Cluster 19 (1n)|Cluster 19 (1n)]]
- [[_COMMUNITY_Cluster 20 (1n)|Cluster 20 (1n)]]
- [[_COMMUNITY_Cluster 21 (1n)|Cluster 21 (1n)]]
- [[_COMMUNITY_Cluster 22 (1n)|Cluster 22 (1n)]]
- [[_COMMUNITY_Cluster 23 (1n)|Cluster 23 (1n)]]
- [[_COMMUNITY_Cluster 24 (1n)|Cluster 24 (1n)]]
- [[_COMMUNITY_Cluster 25 (1n)|Cluster 25 (1n)]]

## God Nodes (most connected - your core abstractions)
1. `Pattern: subpath exports` - 5 edges
2. `walk()` - 4 edges
3. `Pattern: Add schema workflow` - 4 edges
4. `Pattern: domain file split` - 3 edges
5. `Pattern: ESM+CJS dual build via tsup` - 3 edges
6. `scrubSecrets()` - 2 edges
7. `isPlainObject()` - 2 edges
8. `scrubDeep()` - 2 edges
9. `AppException` - 2 edges
10. `Pattern: Zod infer types` - 2 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities

### Community 0 - "Cluster 0 (9n)"
Cohesion: 0.28
Nodes (7): File: dist/, File: src/schemas/{domain}.ts, Pattern: Add schema workflow, Pattern: ESM+CJS dual build via tsup, Rationale: dist must be refreshed to be referenced by other packages, Rule: Adding schema follows 4-step workflow, Rule: Run npm run build after modifying shared

### Community 1 - "Cluster 1 (8n)"
Cohesion: 0.32
Nodes (0): 

### Community 2 - "Cluster 2 (6n)"
Cohesion: 0.53
Nodes (4): isPlainObject(), scrubDeep(), scrubSecrets(), walk()

### Community 3 - "Cluster 3 (6n)"
Cohesion: 0.33
Nodes (6): File: @kiditem/shared/errors, File: @kiditem/shared/internal/*, File: @kiditem/shared/schemas, Pattern: subpath exports, Prohibit: Direct import of @kiditem/shared/internal/*, Rationale: Internal subpath blocks leakage of implementation details

### Community 4 - "Cluster 4 (5n)"
Cohesion: 0.4
Nodes (5): Pattern: JsonValue narrowing, Pattern: zIsoDate union, Rationale: Prisma Date + JSON string boundary dual compatibility, Rule: Date fields use zIsoDate union, Rule: Narrow Prisma JsonValue at map step for satisfies

### Community 5 - "Cluster 5 (4n)"
Cohesion: 0.5
Nodes (4): File: schemas/order.ts, File: schemas/product.ts, Pattern: domain file split, Rule: Split schemas by domain file

### Community 6 - "Cluster 6 (3n)"
Cohesion: 0.67
Nodes (1): AppException

### Community 7 - "Cluster 7 (3n)"
Cohesion: 0.67
Nodes (3): Pattern: satisfies drift detection, Rationale: satisfies pattern detects Prisma-Shared type drift at compile time, Rule: Use satisfies pattern in backend services to detect Prisma/Shared drift

### Community 8 - "Cluster 8 (3n)"
Cohesion: 0.67
Nodes (3): Pattern: Zod infer types, Prohibit: Defining separate interface instead of z.infer, Rule: Use z.infer for type derivation

### Community 9 - "Cluster 9 (2n)"
Cohesion: 1.0
Nodes (2): Pattern: omit derived schema, Rule: Use .omit() derived schema for subset responses

### Community 10 - "Cluster 10 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 11 - "Cluster 11 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "Cluster 12 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "Cluster 13 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "Cluster 14 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "Cluster 15 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "Cluster 16 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "Cluster 17 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "Cluster 18 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "Cluster 19 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Cluster 20 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Cluster 21 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Cluster 22 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Cluster 23 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Cluster 24 (1n)"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Cluster 25 (1n)"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **19 isolated node(s):** `Pattern: omit derived schema`, `Rule: Run npm run build after modifying shared`, `Rule: Use z.infer for type derivation`, `Rule: Use satisfies pattern in backend services to detect Prisma/Shared drift`, `Rule: Date fields use zIsoDate union` (+14 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Cluster 9 (2n)`** (2 nodes): `Pattern: omit derived schema`, `Rule: Use .omit() derived schema for subset responses`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 10 (1n)`** (1 nodes): `tsup.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 11 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 12 (1n)`** (1 nodes): `inventory.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 13 (1n)`** (1 nodes): `profit-loss.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 14 (1n)`** (1 nodes): `feature-gate.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 15 (1n)`** (1 nodes): `thumbnails.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 16 (1n)`** (1 nodes): `product.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 17 (1n)`** (1 nodes): `dashboard.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 18 (1n)`** (1 nodes): `inspection.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 19 (1n)`** (1 nodes): `rules.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 20 (1n)`** (1 nodes): `action-task.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 21 (1n)`** (1 nodes): `ads.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 22 (1n)`** (1 nodes): `reviews.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 23 (1n)`** (1 nodes): `alerts.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 24 (1n)`** (1 nodes): `codes.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Cluster 25 (1n)`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 3 inferred relationships involving `Pattern: subpath exports` (e.g. with `File: @kiditem/shared/schemas` and `File: @kiditem/shared/errors`) actually correct?**
  _`Pattern: subpath exports` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `Pattern: Add schema workflow` (e.g. with `File: src/schemas/{domain}.ts` and `index.ts`) actually correct?**
  _`Pattern: Add schema workflow` has 3 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `Pattern: domain file split` (e.g. with `File: schemas/product.ts` and `File: schemas/order.ts`) actually correct?**
  _`Pattern: domain file split` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Pattern: omit derived schema`, `Rule: Run npm run build after modifying shared`, `Rule: Use z.infer for type derivation` to the rest of the system?**
  _19 weakly-connected nodes found - possible documentation gaps or missing edges._