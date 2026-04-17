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
- Date 필드는 `zIsoDate` (`z.union([z.string(), z.date()])`) 사용 — Prisma Date 반환 + JSON string 수신 양쪽 대응.
- 응답이 엔티티 부분집합일 때 `.omit()` 파생 스키마 사용: `AgentListItemSchema = AgentSchema.omit({ promptTemplate: true })`
- 도메인별 파일 분리: `schemas/product.ts`, `schemas/order.ts`, etc.

## `satisfies` 패턴 — Prisma↔Shared drift 감지 (필수)

`@kiditem/shared` 타입을 반환하는 **모든** Backend service 메서드는 `return { ... } satisfies <SharedType>` 로 마감해야 한다. Prisma generated row 와 Shared Zod 타입이 컴파일 타임에 일치하는지 검증하는 유일한 방어선.

```typescript
// ✅ 올바름
async findAll(): Promise<ProductListItem[]> {
  const items = await this.prisma.product.findMany({ ... });
  return items.map(p => ({
    id: p.id,
    name: p.name,
    // ...
  } satisfies ProductListItem));
}

// ❌ 금지 — drift 감지 불가
async findAll(): Promise<ProductListItem[]> {
  const items = await this.prisma.product.findMany({ ... });
  return items.map(p => ({ id: p.id, name: p.name }));  // 타입 불일치해도 TypeScript 침묵
}
```

**Prisma `JsonValue` 필드는 map 단계에서 좁혀야 통과**: `permissions: item.permissions as Record<string, unknown> | null`

### 신규 service 작성 시 self-check

```bash
# 누락된 service 찾기
for f in $(grep -rlE "from '@kiditem/shared'" apps/server/src --include="*.service.ts"); do
  grep -qE 'satisfies ' "$f" || echo "MISSING: $f"
done
```

결과가 비어있어야 정상. 현재 누락 상태 추적 및 작업 대상: [#21](https://github.com/AgentFoundry-Labs/kiditem/issues/21).
