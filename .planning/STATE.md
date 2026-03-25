# State

## Current Position

Phase: Phase 1 — Foundation
Plan: 01-03 complete, Phase 1 plans all complete
Status: Executing
Last activity: 2026-03-25 — Completed 01-03-PLAN.md (Data import)

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-25)

**Core value:** 셀러가 쿠팡 운영 데이터를 한 곳에서 보고 의사결정할 수 있어야 한다
**Current focus:** Phase 1 — DB 스키마 재설계 + JSON 데이터 임포트

## Progress

```
Milestone v1.0: [=         ] 8%

Phase 1 Foundation         [===       ] 1/3 plans complete
Phase 2 Order Dashboard    [ ] Not started
Phase 3 Return Dashboard   [ ] Not started
Phase 4 Product Enhancement [ ] Not started
```

## Performance Metrics

Plans completed: 1
Phases completed: 0
Requirements delivered: 4/22

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01    | 01   | 2min     | 1     | 2     |
| 01    | 03   | 5min     | 1     | 1     |

## Accumulated Context

### Key Decisions

- 쿠팡 원본 ID(shipmentBoxId, returnDeliveryId 등 19자리)는 Prisma String 타입으로 저장 — BigInt 직렬화 에러 예방
- coupang_orders_raw.json은 배열이 아닌 객체({0:..., 1:...}) 형태 — 시드 스크립트에서 Object.values() 처리 필수
- 임포트는 upsert 패턴으로 멱등성 보장 (seed-coupang.ts 분리)
- 기존 Order 모델 의존 서비스 4개(dashboard, inventory, products, reviews) — 스키마 변경 후 tsc --noEmit으로 컴파일 에러 확인 필수
- KST implicit 타임스탬프는 parseKST() 헬퍼로 UTC 변환 (new Date(str + "+09:00"))
- 반품 데이터의 completedAt 필드명은 실제로 completeConfirmDate — seed-coupang.ts에서 매핑 처리
- 상품 상세 images는 item-level에 있음 (d.items[].images) — product-level에는 없음
- deliveryInfo는 원본에 래핑 객체 없음 — 개별 필드에서 조합하여 Json으로 저장

### Blockers

None

### Todos

- [x] Execute 01-01-PLAN.md (Schema models) — completed 2026-03-25
- [ ] Execute 01-02-PLAN.md (Service refactoring)
- [x] Execute 01-03-PLAN.md (Data import) — completed 2026-03-25
