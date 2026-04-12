# packages/shared — @kiditem/shared

Frontend와 Backend 간 공유 Zod 스키마 + TypeScript 타입 + 에러 코드.

## Build

```bash
npm run build    # tsup → dist/ (ESM + CJS dual format)
```

수정 후 반드시 `npm run build` 실행. dist가 갱신되어야 다른 패키지에서 참조 가능.

## Subpath Exports

```typescript
import { ProductListItem } from '@kiditem/shared';          // types (re-exported)
import { ProductListItemSchema } from '@kiditem/shared/schemas';  // Zod schemas
import { ErrorCodes } from '@kiditem/shared/errors';         // error codes
```

`@kiditem/shared/internal/*` → null (내부 모듈 직접 import 차단)

## Adding a Schema

1. `src/schemas/{domain}.ts`에 Zod 스키마 정의
2. `src/schemas/index.ts`에서 export
3. `src/index.ts`에서 re-export (타입)
4. `npm run build`

## Rules

- Zod 스키마 → `z.infer<typeof Schema>`로 타입 추론. 별도 interface 금지.
- Backend services에서 `satisfies` 패턴으로 Prisma ↔ Shared 타입 드리프트 감지: `return { ... } satisfies ProductListItem`
- Date 필드는 `zIsoDate` (`z.union([z.string(), z.date()])`) 사용 — Prisma Date 반환 + JSON string 수신 양쪽 대응.
- Prisma `JsonValue` 필드는 map 단계에서 좁혀야 satisfies 통과: `permissions: item.permissions as Record<string, unknown> | null`
- 응답이 엔티티 부분집합일 때 `.omit()` 파생 스키마 사용: `AgentListItemSchema = AgentSchema.omit({ promptTemplate: true })`
- 도메인별 파일 분리: `schemas/product.ts`, `schemas/order.ts`, etc.
