# Architecture Decision Records (ADR)

이 폴더는 KidItem 의 **아키텍처 결정 이력** 이다. 결정 이력은 한 번 작성되면 불변 — 뒤집힐 땐 새 ADR 을 발행하고 기존에 `superseded-by` 한 줄만 추가한다. "왜 이 방향이었는지" 를 6개월 뒤에도 재구성할 수 있게 하는 것이 목적.

## 왜 별도 레이어인가

- `CLAUDE.md` = 현재 시점의 규칙 + 핵심 운영 절차 + 프로세스 교훈 ("지금 이렇게 한다" — 시작/검증/커밋/PR + No follow-up/DI verification 포함)
- `.claude/docs/{erd,architecture,commands}.md` = 현재 상태 스냅샷
- `docs/{REFACTOR_PLAN,AGENT_OS_PATTERNS,TODOS}.md` = 작업 중인 mutable 문서
- git log / PR 본문 = 코드 변경 단위 (비-코드 결정은 누락)

> **통합 이력 (2026-04-17)**: 과거 `.claude/docs/workflow.md` 는 루트 `CLAUDE.md` "Core Workflow" 섹션으로 통합. `.claude/docs/lessons.md` 는 실질 교훈 2개(DI Wiring → Verification 규칙 / Follow-up Debt → No follow-up issues)가 루트 `CLAUDE.md` Essentials 로 흡수돼 삭제. 나머지 항목은 ADR 로 이관됨.

위 모두 "지금" 만 기록한다. **"왜 여기로 왔는가"** 는 ADR 이 담는다.

## 트리거 체크리스트

PR 작성 시 아래 중 **하나라도 해당**하면 ADR 작성:

1. 새 cross-domain 규칙 추가 (예: "프론트는 DB 직접 접근 금지")
2. 기존 금지/허용 규칙 전복
3. 런타임·모듈 경계 이동 (예: workflows → agents)
4. 기술 선택 교체 (예: Zod DTO → class-validator)
5. 기능/모듈 Deprecated 선언
6. 인시던트로 새 영구 규칙 생성

**대상 아님**: 리팩터링, 버그픽스, 기능 추가, 스타일 변경, 문서 작업, 단일 도메인 내부 구현 선택.

PR 템플릿의 `## 아키텍처 결정` 섹션 체크박스로 선택.

## 파일 포맷

### 파일명

`NNNN-kebab-title.md` (예: `0001-no-pg-native-enum.md`)

### 프론트매터

```yaml
---
id: 0001
title: No PG native enum
status: Accepted          # Proposed | Accepted | Deprecated | Superseded
date: 2026-04-14
supersedes: []            # 이 ADR 이 뒤집는 ADR 번호 배열, 예: [0003]
superseded-by: null       # 이 ADR 을 뒤집은 후행 ADR 번호, 예: 0012
affects:                  # 영향받는 도메인 슬러그 배열 (폴더명 기반)
  - prisma
  - apps/server
---
```

### 본문 섹션

- `## Context` — 왜 이 결정이 필요했는가 (배경, 제약, 촉발 사건)
- `## Decision` — 무엇을 하기로 했는가 (한 문장 + 상세)
- `## Consequences` — 결과·트레이드오프 (긍정·부정·따라오는 제약)
- `## Related` — 관련 ADR 번호, 메모리 노트, PR 링크

한국어. 분량 50~120줄 권장.

### `affects` 필드

도메인 슬러그는 해당 도메인 CLAUDE.md 파일 경로 기반:

| 슬러그 | 경로 |
|---|---|
| `prisma` | `prisma/CLAUDE.md` |
| `apps/server` | `apps/server/CLAUDE.md` |
| `apps/server/src/advertising` | `apps/server/src/advertising/CLAUDE.md` |
| `apps/server/src/agent-registry` | `apps/server/src/agent-registry/CLAUDE.md` |
| `apps/server/src/workflows` | `apps/server/src/workflows/CLAUDE.md` |
| `apps/web` | `apps/web/CLAUDE.md` |
| `agents` | `agents/CLAUDE.md` |
| `packages/shared` | `packages/shared/CLAUDE.md` |
| `packages/templates` | `packages/templates/CLAUDE.md` |

역방향 인덱스는 `grep -l "affects:.*<도메인>" .claude/docs/decisions/*.md` 로 즉시 추출. 도메인 CLAUDE.md 에 ADR 목록을 수동 미러링하지 않는다(동기화 부채 회피).

## 번호 규칙

- **Lowest unused** — 새 ADR 은 `ls .claude/docs/decisions/ | awk` 로 최대값 + 1
- **동시 PR 충돌** — 같은 번호 동시 발생 시 후행 머지 측이 `+1` 재할당하는 rename 커밋을 추가

## 상태 전이

### Superseded

새 ADR 이 같은 주제를 뒤집을 때:
1. 새 ADR 발행 (번호 + 내용)
2. 새 ADR 프론트매터에 `supersedes: [<기존번호>]`
3. 기존 ADR 프론트매터에 `superseded-by: <새번호>` 한 줄만 추가 — **본문 수정 금지**

### Deprecated

결정 대상이 코드에서 완전히 제거돼 결정 자체가 무의미해질 때(예: Python 에이전트 런타임 자체 제거 시 ADR-0003 Deprecated):
- 프론트매터 `status: Deprecated`
- 본문 맨 위에 `Deprecated: <사유, YYYY-MM-DD>` 한 줄만 추가 — **기존 본문 수정 금지**

### 오기 정정

본문 수정 금지가 원칙. 정정이 필요하면:
- 큰 오류(결정 자체가 잘못됨) → 새 ADR 발행 + Supersedes
- 작은 오기(Context 오타·사실 오류) → 이 README 의 `## Errata` 섹션에 한 줄 추가

## 인덱스

| # | 제목 | 상태 | 일자 | affects |
|---|---|---|---|---|
| [0000](0000-meta-why-adr.md) | Meta: 왜 ADR 을 쓰는가 | Accepted | 2026-04-14 | (meta) |
| [0001](0001-no-pg-native-enum.md) | No PG native enum | Accepted | 2026-04-14 | prisma, apps/server |
| [0002](0002-class-validator-over-zod-for-dto.md) | NestJS DTO 는 class-validator | Accepted | 2026-04-14 | apps/server |
| [0003](0003-python-agents-communicate-via-db.md) | Python agents communicate via DB | Accepted | 2026-04-14 | agents |
| [0004](0004-agent-pipeline-event-driven.md) | Agent pipeline event-driven | Accepted | 2026-04-14 | apps/server/src/agent-registry, agents |
| [0005](0005-no-silent-model-fallback.md) | No silent model fallback | Accepted | 2026-04-14 | apps/server/src/agent-registry, agents |
| [0006](0006-authenticated-company-scope.md) | Authenticated company scope | Accepted | 2026-04-14 | apps/server |
| [0007](0007-secret-scrub-write-and-read.md) | Secret scrub — write / read / backfill | Accepted | 2026-04-14 | apps/server/src/agent-registry, packages/shared, prisma |
| [0008](0008-admin-role-gated-observability.md) | Admin role-gated observability | Accepted | 2026-04-14 | apps/server, apps/server/src/agent-registry |
| [0009](0009-no-queryraw-unsafe.md) | No $queryRawUnsafe | Accepted | 2026-04-14 | apps/server, apps/server/src/agent-registry, apps/server/src/products |
| [0010](0010-panel-sse-frontend-exception.md) | Panel 도메인 SSE 프론트엔드 예외 | Accepted | 2026-04-15 | apps/web |
| [0011](0011-status-canonical-lifecycle.md) | Status canonical lifecycle | Accepted | 2026-04-15 | prisma, apps/server, apps/web, packages/shared |

## By Domain

### prisma
- [0001](0001-no-pg-native-enum.md) — No PG native enum
- [0007](0007-secret-scrub-write-and-read.md) — Secret scrub — write / read / backfill
- [0011](0011-status-canonical-lifecycle.md) — Status canonical lifecycle

### apps/server
- [0001](0001-no-pg-native-enum.md) — No PG native enum
- [0002](0002-class-validator-over-zod-for-dto.md) — NestJS DTO 는 class-validator
- [0006](0006-authenticated-company-scope.md) — Authenticated company scope
- [0008](0008-admin-role-gated-observability.md) — Admin role-gated observability
- [0009](0009-no-queryraw-unsafe.md) — No $queryRawUnsafe
- [0011](0011-status-canonical-lifecycle.md) — Status canonical lifecycle

### apps/server/src/workflows
- [0011](0011-status-canonical-lifecycle.md) — Status canonical lifecycle

### apps/server/src/agent-registry
- [0004](0004-agent-pipeline-event-driven.md) — Agent pipeline event-driven
- [0005](0005-no-silent-model-fallback.md) — No silent model fallback
- [0007](0007-secret-scrub-write-and-read.md) — Secret scrub — write / read / backfill
- [0008](0008-admin-role-gated-observability.md) — Admin role-gated observability
- [0009](0009-no-queryraw-unsafe.md) — No $queryRawUnsafe
- [0011](0011-status-canonical-lifecycle.md) — Status canonical lifecycle

### apps/server/src/products
- [0009](0009-no-queryraw-unsafe.md) — No $queryRawUnsafe
- [0011](0011-status-canonical-lifecycle.md) — Status canonical lifecycle

### packages/shared
- [0007](0007-secret-scrub-write-and-read.md) — Secret scrub — write / read / backfill
- [0011](0011-status-canonical-lifecycle.md) — Status canonical lifecycle

### agents
- [0003](0003-python-agents-communicate-via-db.md) — Python agents communicate via DB
- [0004](0004-agent-pipeline-event-driven.md) — Agent pipeline event-driven
- [0005](0005-no-silent-model-fallback.md) — No silent model fallback

### apps/web
- [0010](0010-panel-sse-frontend-exception.md) — Panel 도메인 SSE 프론트엔드 예외
- [0011](0011-status-canonical-lifecycle.md) — Status canonical lifecycle

### 영향 없음 (현재 시점)
`apps/server/src/advertising`, `packages/templates` — 해당 도메인 규칙이 생성·전복되는 시점에 ADR 발행.

> `apps/server/src/products` 는 ADR-0009 로 신설. 별도 `CLAUDE.md` 는 아직 없음 — 해당 도메인 규칙 문서화 시 슬러그 테이블 추가.

> `By Domain` 은 수동 유지. 새 ADR 작성 시 해당 도메인 섹션에 한 줄 추가. `affects` 프론트매터 필드가 소스 오브 트루스 — `grep -l "affects:.*<domain>" *.md` 로 언제든 재생성 가능.

## Errata

아직 없음.
