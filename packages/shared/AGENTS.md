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

## Reconstruction Export Policy

- Treat `src/index.ts` and `src/schemas/index.ts` as compatibility surfaces, not the place for new domain growth.
- New or rebuilt domain contracts should add subpath exports first, for example `@kiditem/shared/product`, `@kiditem/shared/order`, `@kiditem/shared/inventory`, `@kiditem/shared/ai`, `@kiditem/shared/advertising`, `@kiditem/shared/errors`, and `@kiditem/shared/security`.
- New domain schemas/types must not expand the root barrel. Add a focused `src/{domain}.ts` entrypoint and package subpath export, then migrate consumers to that subpath.
- Keep root exports temporarily while migrating existing consumers, then remove them only after server and web builds prove no direct consumer remains.
- Backend-only concepts must not leak into frontend-facing root exports. Nest-specific errors or exception classes belong behind backend-only imports or server-local code.
- Do not add legacy aliases during migration. Move consumers to the canonical schema/type name.

## Adding a Schema

1. `src/schemas/{domain}.ts`에 Zod 스키마 정의
2. 새 도메인이라면 `src/{domain}.ts` entrypoint 와 package subpath export 를 먼저 추가
3. 기존 compatibility surface 에 이미 있는 도메인을 확장하는 경우에만 `src/schemas/index.ts`에서 임시 re-export
4. 기존 root consumer 호환이 필요한 경우에만 `src/index.ts`에서 임시 re-export
5. `npm run build`

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
# 누락된 service 찾기 (utility 함수만 import 하는 false positive 제외)
# 핵심: shared import 라인에 PascalCase 식별자가 있어야 type/schema 사용으로 간주
for f in $(grep -rlE "from '@kiditem/shared'" apps/server/src --include="*.service.ts"); do
  if grep -E "from '@kiditem/shared'" "$f" | grep -qE '\b[A-Z][a-zA-Z]+\b'; then
    grep -qE 'satisfies ' "$f" || echo "MISSING: $f"
  fi
done
```

결과가 비어있어야 정상. PascalCase 필터로 `scrubSecrets` 같은 camelCase 유틸 import 만 하는 service 는 제외 (drift 위험 0).

> **Note**: 이전 버전 (단순 `from '@kiditem/shared'` grep) 은 utility 함수 import 도 false positive 로 잡았음. 2026-04-17 정정 후 [#21](https://github.com/AgentFoundry-Labs/kiditem/issues/21) closed (실제 4 services 모두 cover).
