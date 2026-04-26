---
id: 0012
title: Prisma v7 multi-file schema with namespace annotations
status: Accepted
date: 2026-04-17
supersedes: []
superseded-by: 0021
affects:
  - prisma
  - apps/server
  - packages/shared
---

## Context

`prisma/schema.prisma` 가 67 모델 / 2082 lines 단일 파일로 성장. 도메인 boundary 가 schema 자체에 없고 `.claude/docs/erd.md` (수동 유지 145+ lines) + `graphify-out/erd/` (LLM 추출 derived view) 두 곳에 외부 분류로 존재. 둘 다 schema 변경 시 자동 갱신 안 되어 drift 발생 — 2026-04-17 audit 에서 erd.md 가 6개 모델 (`MasterInventory`, `MasterProduct`, `MasterSupplierProduct`, `OptionMaster`, `ProductMemo`, `ThumbnailTracking`) 누락 확인. graphify-out/ 는 자체 생성 GRAPH_REPORT.md 가 *"You may not need a graph"* 라고 self-confess.

작업 시 도메인 boundary 가 schema 만 보고는 알기 어렵고 외부 문서 참조 필요. 신규 모델 추가 시 어느 도메인에 속하는지 명시할 곳 없어서 분류가 implicit 한 채로 누적.

추가 동인: Prisma v7 (우리 v7.5) 가 multi-file schema 를 GA 로 지원 (v6 부터). `prisma.config.ts` 의 `schema: 'prisma'` 디렉토리 지정으로 모든 `.prisma` 파일을 자동 merge. 단일 schema 와 동일한 generated client 결과.

## Decision

**`prisma/schema.prisma` 를 9 도메인 파일로 분리하고 각 모델에 `/// @namespace` + `/// @describe` 주석을 inline 으로 부착한다.** Schema 자체가 도메인 분류 + 모델 의미의 source of truth 가 된다.

### 파일 구조 (Prisma v7 best-practice 준수)

```
prisma/
├── schema.prisma       # generator + datasource 만 (블록 위치는 migrations/ 와 같은 level 필수)
├── migrations/         # 기존 그대로
└── models/             # 도메인별 모델 (alphabetical)
    ├── advertising.prisma
    ├── agents.prisma
    ├── ai.prisma
    ├── core.prisma
    ├── finance.prisma
    ├── inventory.prisma
    ├── orders.prisma
    ├── supply.prisma
    └── system.prisma
```

### 모델 주석 패턴 (prisma-markdown 호환)

```prisma
/// @namespace Advertising
/// @describe 익스텐션이 수집한 raw 데이터. level 로 구분 (campaign|product|null).
model AdSnapshot {
  id String @id @default(uuid()) @db.Uuid
  ...
}
```

- `@namespace <Domain>` — 도메인 이름 (PascalCase). 한 모델이 여러 namespace 에 속할 수 있음 (멀티 라벨)
- `@describe <한 줄>` — 모델의 역할 한 줄. seed 분량은 audit 시점 27/67 (선택적 보강 항목)

### 설정 변경

- `prisma.config.ts`: `schema: 'prisma/schema.prisma'` → `schema: 'prisma'` (디렉토리 지정)
- `package.json` 의 `db:*` scripts: 명시적 `--schema=prisma/schema.prisma` 플래그 제거 (config 가 처리)
- `postinstall: prisma generate` 추가 — 신규 셋업 / CI dependency cache hit 시 Client 자동 재생성 (Prisma Next.js troubleshooting 권장)

### 폐기 (Decision 의 일부)

이 결정의 자연스러운 귀결로 다음을 제거:
- `.claude/docs/erd.md` — schema 자체로 대체
- `graphify-out/` 전체 — schema 의 derived view 가 source 와 drift 를 일으키는 구조적 결함
- `scripts/graphify-*.{py,sh}` 5개 + `.claude/settings.json` 의 SessionStart graphify-distill hook + PreToolUse graphify-hint hook
- `.claude/docs/lessons.md`, `.claude/docs/workflow.md` — 핵심 규칙은 루트 `CLAUDE.md` 의 "Core Workflow" 섹션으로 흡수

## Alternatives Rejected

| 대안 | 기각 이유 |
|---|---|
| 단일 `schema.prisma` 유지 + `/// @namespace` 주석만 | 파일 길이 (2082 lines) 가독성 문제 미해결. 도메인별 git diff 분리 안 됨. 작업 시 전체 파일 로드 |
| `prisma/schema/` (subdirectory 안에 main + models 같이) | Prisma v7 best-practice 는 main `schema.prisma` 와 `migrations/` 를 같은 level 에 두는 것 — 우리 case 에 더 안전 |
| `prisma-markdown` generator 즉시 도입 → ERD.md 자동 생성 | 67 모델 × ~25 lines = 2400+ lines ERD.md 산출. AI context 에 always-on 부담. 주석 패턴은 호환 유지 → 시각화 필요 시 generator 한 줄 추가만으로 활성화 가능 (지연 결정) |
| 도메인 분류 외부 문서 (erd.md) 강화 + 자동 검증 script | drift 의 fundamental cause 는 외부 분류 자체. script 는 작성자 규율 의존, schema-as-source 가 더 robust |

## Consequences

**긍정**:
- 도메인 boundary 가 schema 자체에 inline → drift 불가능 (single source of truth)
- 신규 모델 추가 시 도메인 파일 선택 + namespace 명시가 자명 (작업자가 머뭇거릴 여지 없음)
- 도메인별 PR diff 가독성 ↑ (`git log -- prisma/models/advertising.prisma` 로 광고 도메인 schema 변경 이력 격리)
- `prisma-markdown`, `prisma-erd-generator` 등 generator 와 그대로 호환 (주석 패턴 표준)
- CLAUDE.md (규칙) ↔ schema (모델) 의 source of truth 가 명확히 분리

**부정 / 트레이드오프**:
- 신규 contributor 가 `schema.prisma` 만 보고 모델을 못 찾음 → `prisma/CLAUDE.md` 의 도메인 매핑 표로 보완 (작성됨)
- 한 모델이 의미상 여러 도메인에 걸치면 (예: `Settlement` 가 주문/재무 양쪽) 단일 파일 배치를 결정해야 함 → 현재 결정 기록 (Settlement → orders, inventory 의 Stock 이중 분류 모델은 namespace multi-label 활용)
- `prisma generate` 가 디렉토리 scan 추가 (수ms, 무시 가능)
- 기존 `prisma/schema.prisma` 참조한 외부 도구 / 스크립트 (있다면) 경로 갱신 필요

**뒤따르는 제약**:
- 신규 모델 추가 시 `/// @namespace <Domain>` 주석 의무 (CLAUDE.md 에 명문화)
- `prisma.config.ts` 가 schema 위치의 단일 진입점 — 변경 시 신중
- Prisma v6 미만 다운그레이드 불가 (v6 GA 의존)

## Related

- PR [#20](https://github.com/AgentFoundry-Labs/kiditem/pull/20) — 본 ADR 결정의 구현
- [ADR-0001](0001-no-pg-native-enum.md) — String + app validation (이 ADR 과 함께 schema 정책 계열)
- [`prisma/CLAUDE.md`](../../../prisma/CLAUDE.md) — multi-file 파일 구조 + 도메인 매핑 + 명령
- [`apps/server/CLAUDE.md`](../../../apps/server/CLAUDE.md) — Data Access 섹션 (5+ rule, repository 트리거) 이 schema 의 도메인 분류와 정합
- [`packages/shared/CLAUDE.md`](../../../packages/shared/CLAUDE.md) — `satisfies <SharedType>` 패턴 (schema-derived Prisma type 과 shared Zod 타입의 drift 감지)
- Prisma 공식 docs: [schema location](https://www.prisma.io/docs/orm/prisma-schema/overview/location), [best practices](https://www.prisma.io/docs/orm/more/best-practices)
