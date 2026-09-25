# Testing — risk-based 3-tier strategy

KidItem 은 테스트를 많이 쓰는 것이 아니라, 운영 리스크를 줄이는 데
가치가 있는 테스트만 쓴다. 테스트도 유지보수 대상이므로 커버리지 숫자나
파일 수를 목표로 삼지 않는다.

참고 기준: [토스 기술 블로그 — 가치있는 테스트를 위한 전략과 구현](https://toss.tech/article/test-strategy-server)

## 테스트 작성 기준

새 테스트는 아래 중 하나를 만족할 때만 추가한다.

| 테스트 목적 | 작성 기준 | 선호 tier |
|---|---|---|
| **운영 치명 경로** | 깨지면 보안/돈/재고/광고비/주문/외부 채널 실행에 직접 피해가 나는 흐름 | Integration 또는 E2E |
| **Tenant / IDOR / raw SQL 안전** | `organizationId` 격리, 2-hop/3-hop tenant predicate, `$queryRaw` 조건, scoped mutation 보장이 필요함 | Integration + scanner |
| **Transaction / row-lock / race** | `updateMany(count)`, `SELECT FOR UPDATE`, unique constraint, rollback semantics 처럼 DB가 실제 판정자임 | Integration |
| **도메인 정책** | 가격, 재고, 광고 예산, 등급, 상태 전이처럼 순수 계산/규칙이 있고 경계값이 중요함 | Unit, 실제 객체 |
| **Public contract** | API response, Zod schema, external payload, cache/serialization shape가 깨지면 소비자가 깨짐 | E2E, contract unit |
| **재발 방지** | 실제 장애/버그가 있었고 동일 회귀가 운영상 위험함 | 가장 낮은 비용의 tier |

아래 경우에는 새 테스트를 만들지 않는다.

- 파일 이동, 함수 추출, 레이어 분리만 검증하는 implementation-detail 테스트
- Prisma CRUD를 1:1로 감싼 wrapper의 `toHaveBeenCalledWith` 반복
- TypeScript type/build/scanner가 이미 막는 단순 wiring
- 기존 통합 테스트가 같은 public behavior를 이미 보호하는 경우
- 제품 수명이 짧거나 수동 smoke가 더 싼 일회성 이벤트성 코드
- 실패해도 운영 피해가 작고 테스트 유지비가 더 큰 branch coverage 보강

테스트 추가 전 체크리스트:

1. 이 버그가 운영에 나가면 실제 피해가 큰가?
2. 테스트가 private 구현이 아니라 public behavior 또는 도메인 정책을 검증하는가?
3. 기존 테스트, build, scanner로 이미 충분히 막히는가?
4. 한 개의 유스케이스/integration 테스트로 여러 레이어를 같이 커버할 수 있는가?
5. 테스트가 빠르고 독립적이며 반복 가능한가?
6. mock 준비 코드가 본문보다 길어지거나 의도를 흐리지는 않는가?

## TDD 산출물과 파일 위치

TDD 로 생긴 spec 은 임시 산출물이 아니라 행동 계약이다. 실패를 확인한
뒤 production code 를 통과시킨 테스트는 기본적으로 git 에 남긴다. 단,
spike/exploration 테스트, 구현 세부만 검증하는 테스트, 같은 위험을 더 강한
integration/E2E/scanner 가 이미 보호하는 중복 테스트는 아래
[`기존 테스트 정리 기준`](#기존-테스트-정리-기준)에 따라 삭제하거나 합친다.

파일 위치는 실행 config 와 ownership 을 먼저 따른다.

| 영역 | 기본 위치 | 파일명 |
|---|---|---|
| `apps/server/src/{domain}/` | 해당 owner domain 아래 가장 가까운 `__tests__/` | `*.spec.ts` |
| Server real DB integration | 같은 owner domain 의 `__tests__/` | `*.pg.integration.spec.ts` |
| Server HTTP E2E | `apps/server/e2e/` | `*.e2e.spec.ts` |
| `apps/web/src/app/{route}/` | route-local `lib/`, `hooks/`, `components/` 옆 또는 근처 `__tests__/` | `*.spec.ts` 또는 기존 파일군이 쓰는 `*.test.ts` |
| `apps/web/src/lib`, `src/components` | shared owner 폴더의 `__tests__/` 선호 | `*.spec.ts` 또는 기존 파일군이 쓰는 `*.test.ts` |
| `packages/shared/src/` | schema/entrypoint 옆 co-located | `*.spec.ts` |
| `scripts/` | `scripts/__tests__/` | `*.spec.ts` |
| Agent interaction cross-process acceptance | `scripts/smoke-interaction-os.mjs` + Agent OS PostgreSQL integration specs | smoke + `*.pg.integration.spec.ts` |

Fresh-clone developer setup is a public repository contract. Keep its dynamic
helpers under `scripts/__tests__/*.spec.ts` and its cross-file assertions in
`scripts/__tests__/developer-onboarding-contract.test.mjs`. The contract must
cover the Node pin, env/Compose agreement, non-overwrite and file permissions,
local-auth admission, Gateway provider-home isolation, package entrypoints,
and README/runbook links. Run it without a database or provider login:

```bash
node --test scripts/__tests__/developer-onboarding-contract.test.mjs
npm run test:scripts
```

새 파일은 주변 파일군의 관습을 따른다. 서버와 scripts 는 config 가 명시한
`*.spec.ts` / `__tests__` 규칙에서 벗어나지 않는다. 웹은 Vitest 기본 include
때문에 `*.test.ts` 도 실행되지만, 새 테스트는 주변 route 가 이미 `*.test.ts`
를 쓰는 경우가 아니면 `*.spec.ts` 를 우선한다.

## Agent OS native Gateway boundary

KID-25의 provider-native runtime은 다음 경계를 따로 증명한다.

- `scripts/check-agent-os-contraction.mjs --enforce`는 하나의
  `CapabilityInvocation` 모델, 정확한 Agent/domain/capability/MCP 수, active
  credential·secret 비영속, ephemeral Gateway control-state 비영속을 고정한다.
- `apps/server/src/agent-os` focused tests는 authenticated conversation facade,
  exact create-ID replay/title-drift conflict, CopilotKit real HTTP
  `agent/run → agent/connect` completed-event replay, request-key idempotency,
  stateless MCP `2026-07-28`, owner-domain port dispatch를 검증한다. SQLite
  adapter/runner tests는 organization namespace, restart, subscriber departure,
  exact stop, exact deletion을 검증한다. Real PostgreSQL race suite는 같은 입력
  replay, 다른 입력 conflict, concurrent approval, ambiguous owner 결과를
  실제 unique/conditional-write 경계에서 증명한다.
- `apps/agent-gateway` tests는 outbound long-poll/event 계약, provider-native
  conversation/session continuity, serialized descriptor/preference state,
  provider-first exact deletion, internal parent-turn cleanup, explicit
  model/effort, macOS process supervision과 deterministic Windows 계약을
  다룬다. Provider login과 session continuity는 host account가 소유하며 Nest,
  DB, worker, 브라우저로 복사하지 않는다. Canonical completed AG-UI history는
  Gateway가 아니라 API-local SQLite runner 계약으로 별도 검증한다.
- `apps/web` focused tests는 authenticated route-stable
  `ConversationProvider`/`RuntimeHost`, Agent OS history versus global chat
  presentation, and the one `notifications | ai_chat | null`
  `RightAuxiliaryPanel` state machine을 검증한다. 1536 px 이상 (`2xl`) desktop은
  정확히 352 px push dock으로 work surface 폭을 줄이고, 768-1535 px tablet은
  정확히 352 px overlay, 768 px 미만 mobile은 full-width modal drawer를 쓴다.
  Shared 256/64 sidebar shell, desktop preference continuity, panel/Agent OS
  shared conversation primitives, focus와 close behavior도 같은 contract에
  포함한다.
- Cutover regression tests require retired presentation paths to be absent,
  including `PanelSheet`, panel-open stores, and duplicate conversation UI.
  Approved Agent OS tree, narrow-composer/draft-parity, structured response,
  business-evidence, card, and settings visual contracts remain covered, while
  `DashboardChartPanel.agent-os-cutover.regression-1.spec.ts` keeps Dashboard
  Agent OS labels, charts, cards, and actions unchanged.
- `npm run qa:agent-os:clean-cutover`는 자체 Testcontainer만 대상으로 legacy
  rows를 버리고 one-model schema를 적용한다. 개발/Office DB, `--force-reset`,
  검증되지 않은 URL은 거절한다. `--serve-browser-qa`는 내장 deterministic
  auth/business seed만 실행하며, interactive stdin과 `--email` 또는
  `KIDITEM_BROWSER_QA_EMAIL`가 없으면 container 시작 전 fail-closed한다.

Normal CI는 live provider login을 요구하지 않는다. macOS executable QA에서는
host의 기존 Codex login으로 canary와 대화 흐름을 확인한다. Claude live reply와
Windows native process/ACL/Job Object/Task Scheduler 실행은 현재 명시적 deferred
항목이며, deterministic contract 검증을 통과했다는 사실과 혼동하지 않는다.
어떤 QA도 provider credential, installation bearer, prompt, canonical mutation
input, raw provider payload를 출력하거나 저장하면 안 된다.

### Agent OS business evaluation

`evals/agent-os`는 실제 모델 행동을 평가하는 별도 개발 자산이다. Provider에
보이는 `agent-config`와 분리하고 production Docker build context에서도 제외한다.
다만 별도 애플리케이션, durable transcript store, conversation runtime을 만들지는
않는다.

역할은 다음과 같이 나눈다.

| 자산 | 위치 | 책임 |
|---|---|---|
| 자연어 case와 숨겨진 판정 기준 | `evals/agent-os/cases/` | 실제 사용자 요청, 복수 capability 경로, milestone, hard invariant, expected/allowed state change, 위임 대안 |
| disposable fixture descriptor | `evals/agent-os/fixtures/` | 기존 격리 browser-QA seed profile과 prompt 변수 이름 |
| evidence contract와 grader | `evals/agent-os/contracts/`, `graders/` | transcript 없이 normalized evidence를 fail-closed 판정 |
| 실제 격리 DB/app/provider 실행 | `scripts/qa-agent-os-clean-cutover.mjs`와 Dashboard QA | production과 같은 public interaction 경로 실행 |
| owner correctness | 각 owner domain의 unit/real PostgreSQL integration spec | approval, exact-input admission, idempotency, race, restart 결과 유실 |
| generated evidence | `.tmp/agent-evals/` | git 비추적 sanitized run 결과 |

모델에는 다음 명령이 렌더링한 `messages`만 전달한다.

```bash
npm run eval:agent-os -- --validate
npm run eval:agent-os -- --list
npm run eval:agent-os -- --prompt <case-id> --var name=value
npm run eval:agent-os -- --grade .tmp/agent-evals/<run>.json
npm run test:agent-evals
```

모델 prompt에 capability 순서, owner request key, canonical input/hash, replay,
변조 시도를 적지 않는다. 이 항목은 deterministic harness 또는 hidden grader가
검증한다. Live trial은 정확한 문장이나 한 경로를 맞히는 시험이 아니라 최종
business outcome과 금지 동작을 판정한다. 판정은 hard safety, business
completion, delegation correctness, grounded-response diagnostics, 3-trial
reliability로 분리한다. 모든 hard invariant는 전 trial에서 통과해야 하고
capability case의 기본 업무 완료 기준은 3회 중 2회다. 응답 Critic/Verifier는
private reasoning을 보거나 저장하지 않으며 deterministic 실패를 pass로 바꾸지
못한다. latency, tool/turn/subagent count는 실제 사용자 문제로 budget이 정해지기
전까지 진단값일 뿐 completion gate가 아니다.

현재 12개 case는 General chat, Sourcing, Merchandising, Supply, Channel
Operations, Advertising의 여섯 사용자-visible profile을 모두 포함한다. grounded
read, 승인·거절 mutation, duplicate no-op, scrape 실패, Products 위임, direct
Merchandising generation, providerless purchase submission, confirmed listing,
Advertising overview, 일반 no-tool 대화, two-turn/restart를 위험 기준으로
표본화한다. `expectedDomainDelta` 호환 parser는 두지 않고 milestone과
expected/allowed state policy로 clean cutover한다. 전체 capability catalog와 MCP
wire를 각각 live prompt로 반복하지 않는다. 모든 공개 key의
discovery/invocation 및 strict schema는 catalog/MCP contract test가, owner
replay·drift·race는 owner integration test가 각각 소유한다.

## Mock / test double 정책

기본값은 실제 객체와 실제 도메인 함수를 사용한다. Mock 은 다음 경우에만
쓴다.

- LLM, Coupang/Wing, 파일 시스템, 네트워크, 브라우저 자동화처럼 외부
  side effect 가 있거나 느리고 비결정적인 협력자
- 현재 테스트의 목적이 "외부 작업을 호출하지 않는다/정확히 위임한다"인 경우
- 에러/타임아웃/경합 상태를 실제 객체로 재현하는 비용이 지나치게 큰 경우

반대로, 순수 도메인 정책과 mapper/calculator 는 mock 하지 않는다. 실제 입력
객체를 만들고 반환값을 검증한다. Prisma 호출 shape 검증은 scanner나 real
Postgres integration 으로 더 정확히 검증할 수 있으면 추가하지 않는다.

### Mock 이 어댑터를 흉내내기 시작하면 Tier 3 로 올린다

Repository port 는 "외부 side effect 협력자"가 아니다. DB 판정이 필요한
동작은 Tier 3 의 real Postgres 가 이미 덮는다.

판정 기준: **테스트가 옳으려면 mock 이 어댑터의 읽기 의미를 흉내내야 하는가.**
그렇다면 그 테스트는 Tier 3 에 속한다. mock 을 더 똑똑하게 만드는 것은
어댑터의 두 번째 구현을 테스트 없이 쓰는 일이다.

구체적 신호:

- 어설션이 **요청 인자에 따라 달라져야 하는데** port 를 `mockResolvedValue`
  로 고정했다. 어떤 창을 물어도 같은 값이 돌아오므로 창 버그를 잡을 수 없고,
  서로 다른 창을 요청한 두 소비자가 같은 답을 받아 **틀린 이유로 통과**한다.
- 이를 고치려 `mockImplementation` 안에 날짜 필터·커버리지·정렬처럼 어댑터가
  하는 판정을 다시 구현하게 된다.
- 기본값 `0` 과 관측된 `0`, 없는 행과 빈 결과처럼 **DB 만이 구별하는 상태**를
  어설션한다.

이때는 mock 을 고치지 말고 `*.pg.integration.spec.ts` 로 옮긴다. 남는 unit
테스트는 어댑터를 거치지 않는 순수 판정만 담당한다.

## 기존 테스트 정리 기준

리팩터링 PR 은 기존 테스트도 함께 정리할 수 있다. 단, 삭제는 "테스트가
거슬린다"가 아니라 "같은 위험을 더 나은 테스트나 gate가 이미 보호한다"는
근거가 있어야 한다.

정리 대상:

- 구현 세부에 강결합된 mock interaction 테스트
- 어댑터의 읽기 의미를 mock 안에 재구현해야 성립하는 테스트 (Tier 3 로 이동)
- 파일 이동/메서드 추출 이후 public behavior를 검증하지 못하는 테스트
- scanner, typecheck, build가 이미 더 안정적으로 보장하는 wiring 테스트
- 같은 user journey를 여러 mock spec이 중복 검증하는 테스트
- 현재 운영 코드와 맞지 않는 과거 구조 문서화 테스트
- 과도한 fixture/stub 준비 때문에 의도를 읽기 어려운 테스트

삭제하거나 축소하면 안 되는 테스트:

- tenant isolation / IDOR / authz 회귀 테스트
- 돈, 재고, 주문, 광고 예산, 외부 채널 실행 결과를 보호하는 테스트
- transaction, row-lock, race, unique constraint, rollback 검증
- public API contract 또는 shared schema 소비자 호환성 테스트
- 실제 장애나 회귀를 막기 위해 추가된 regression test

테스트 정리 PR 의 필수 기록:

- 삭제/축소한 테스트 파일과 이유
- 동일 위험을 대신 보호하는 gate 또는 테스트 이름
- 삭제 후 실행한 focused command
- 위험이 애매하면 삭제하지 말고 `describe.skip` 같은 보류도 하지 않는다;
  그대로 두거나 더 나은 public-behavior 테스트로 먼저 대체한다.

## 요약

| Tier | 명령 | 대상 | Prisma | 속도 | 파일 규칙 |
|---|---|---|---|---|---|
| **Unit** | `npx vitest run` | 단일 서비스/함수/adapter 로직 | mock (`mock-prisma.ts`) | <1s | `*.spec.ts` |
| **E2E (HTTP)** | `npm run test:e2e` (서버 전용) | NestJS app bootstrap + supertest HTTP | mock | ~3-10s | `*.e2e.spec.ts` (apps/server/e2e/) |
| **Integration (real DB)** | `npm run test:integration` | 실제 Postgres 동시성·트랜잭션·IDOR | **real** (Testcontainers Postgres 17) | suite 단위 | `*.pg.integration.spec.ts` |

## Tier 1 — Unit (mock)

대부분의 `*.spec.ts`. 빠른 피드백, 분기 커버리지, assertion 강화에 사용.

```bash
# 전체
npx vitest run --workspace=apps/server
# 특정
npm exec --workspace=apps/server vitest -- run src/products/application/service/product-collection-freshness.usecase.spec.ts
```

**한계**: race / lock / 트랜잭션 isolation 검증 불가. `updateMany({ count: 0 })` 반환을 강제할 순 있지만, 실제 두 트랜잭션 경쟁에서 count 가 어떻게 나오는지는 **mock 으로 재현 불가** (mock Prisma 는 synchronous).

## Tier 2 — E2E (HTTP, mock Prisma)

`apps/server/e2e/*.e2e.spec.ts`. NestJS app 전체를 부팅하고 supertest 로 HTTP 경로 + DTO validation + guard + middleware 검증.

```bash
npm run test:e2e --workspace=apps/server
```

Prisma 는 여전히 mock 이므로 "HTTP 레이어 회귀" 위주. DB 쿼리 정확성은 `toHaveBeenCalledWith({ where: objectContaining({ organizationId }) })` 같은 assertion 으로 간접 검증.

## Tier 3 — Integration (real Postgres)

`src/**/*.pg.integration.spec.ts`. **race guard · 동시성 · IDOR · 실제 트랜잭션 isolation** 이 필요한 시나리오 전용. 프로덕션 버그 재현 레벨.

### 실행 (원 커맨드)

```bash
npm run test:integration

# 특정 파일만 실행해도 같은 ephemeral lifecycle 을 사용한다.
npm run test:integration -- src/inventory/__tests__/inventory-flow.pg.integration.spec.ts
```

명령마다 Testcontainers 가 `postgres:17` 컨테이너 하나를 임의 host port 로
기동하고, 동적 `DATABASE_URL` 로 Prisma schema 를 push 한 뒤 integration worker 에
전달한다. 전체 suite 가 끝나거나 setup 중 schema push 가 실패하면 컨테이너와
데이터를 자동 정리하므로 별도 start/prepare/stop 명령은 필요 없다.

### 언제 Tier 3 로 쓸 것인가

- **Race guard**: `updateMany({ where: { ..., field: null }, count })` 기반 atomic claim 패턴
- **P2002 동시 race**: `@@unique` 제약 걸린 트랜잭션 충돌
- **Multi-statement 트랜잭션**: `$transaction` 내부 롤백 동작
- **IDOR end-to-end**: 다른 organizationId 로 쿼리 시 실제 row 격리

### 현재 예시 커버

- `inventory/__tests__/sellpia-inventory-freshness.repository.pg.integration.spec.ts` — organization-scoped generation/lease fencing and server-time freshness transitions
- `inventory/__tests__/sellpia-inventory-import.repository.pg.integration.spec.ts` — atomic full-snapshot publication, same-hash confirmation, quality hard block, and previous-snapshot preservation
- `channels/__tests__/channel-sku-mapping.pg.integration.spec.ts` — tenant-safe confirmed recipes and inactive-component diagnostics
- `orders/__tests__/rocket-po-catalog.repository.pg.integration.spec.ts` — Rocket vendor/account identity and duplicate canonical publication
- `supply/__tests__/purchase-order-submission.pg.integration.spec.ts` — locked freshness fence, idempotent attempt creation, ambiguous provider classification, and reconciliation

각 파일은 mock 시뮬레이션 대응 파일(`*.spec.ts`) 과 **공존**한다. Mock 은 fast smoke, real 은 동시성 정확성.

### Agent interaction cross-process acceptance

Final Agent OS에는 generic Task, Attempt, KidItem-owned transcript 또는 browser-owned
session graph가 없다. `npm run smoke:interaction-os`는 authenticated facade에서
bounded disposable conversation create의 exact-ID replay와 title-drift `409`,
preference read/set/read, fresh disposable Conversation의 exact public
`agent/connect` SSE contract, empty local namespace, exact disposable deletion을
확인한다. 이 smoke는 completed history를 seed하거나 provider turn을 시작하지
않으며, empty-array pseudo-history `[]`를 받아들이지 않는다. Caller-supplied Gateway/MCP token을
받거나 internal MCP endpoint를 호출하지 않는다.

Completed AG-UI history는 `conversation-copilotkit.controller.spec.ts`의 real HTTP
`agent/run → agent/connect`와 `ConversationSqliteEventHistory`/sqlite-runner
deterministic specs가 검증한다. 이 deterministic gate들은 authenticated organization namespace,
completed-event replay, subscriber departure, restart stale-lock, exact stop, exact
deletion을 검증한다. Runner의 `isRunning`/`stop`은 Nest in-memory active-turn
authority를 통해 exact provider interrupt를 검증한다. MCP tool 목록, active-turn authority, read invocation,
approval-pending mutation은 Gateway loopback integration, MCP server tests, 실제
provider-turn browser QA가 검증한다. Preference traffic은 native serialized state로
끝나며 PostgreSQL persistence를 뜻하지 않는다. Real PostgreSQL integration specs는
durable `CapabilityInvocation`, exact-input approval, owner idempotency, Operation,
organization fence를 독립 Testcontainer에서 검증한다.

Release acceptance는 `npm run qa:agent-os:clean-cutover`의 명시적으로 격리된
PostgreSQL 17에 compiled API, Operations worker, Web을 부팅하고 native macOS
Gateway를 별도 host process로 연결한다. 브라우저 QA는 same-origin
`/api/copilotkit`, SQLite completed-event replay with provider-native session
continuity, Agent-fixed Sourcing entry, direct read, provider-native delegation,
approval-triggered deterministic dispatch and same-key replay, Operation card,
interrupt/restart/no-auto-turn, four-active-turn cap, conversation deletion의
business-record 비연쇄 삭제, nginx internal-route 404를 확인한 뒤 모든 process와
QA container를 종료한다.

Authenticated browser QA is a release gate for one runtime across Dashboard,
work routes, and Agent OS; first-send retry without duplicate streams; global
chat/history presentation replacement; one right auxiliary surface; and the
exact 352 px 1536-plus push/768-1535 overlay/mobile-drawer panel contracts. It
also verifies the shared 256/64 sidebar shell, exact disposable provider
deletion, focus restoration, clean retired-surface removal, approved Agent OS
visuals, and the Dashboard regression contract without printing credentials,
provider payloads, or transcripts.

CopilotKit runner contract tests are the interaction-lifecycle gate: run owns
the active stream, connect projects authenticated organization-namespaced local
SQLite completed history plus live events, and Nest's exact in-memory
active-turn record answers `isRunning` and sends the exact Gateway provider
interrupt for `stop`. Web tests verify only route-stable presentation and
first-send coalescing; they must not recreate a second active-turn,
interrupt-acknowledgement, stale-settlement, or history-reconciliation state
machine.

### Tier 3 추가 시 체크리스트

- 파일명 `*.pg.integration.spec.ts` (vitest unit config 에서 자동 제외)
- `makeTestPrisma()` + `resetDb()` + `seedBaseFixture()` 사용 (`src/test-helpers/real-prisma.ts`)
- `beforeEach` 에 reset + seed
- `afterAll` 에 `$disconnect`
- 안전장치: `assertTestDbUrl` 이 dev/prod DB 로 TRUNCATE 실수 차단

## 인프라 세부

### Testcontainers lifecycle

`vitest.config.integration.ts` 가 다음 lifecycle 을 소유한다.

1. `globalSetup` 이 invocation 당 `postgres:17` 컨테이너 하나를 시작한다.
2. 컨테이너가 발급한 동적 URI 로 루트 Prisma CLI 의
   `db push --accept-data-loss` 를 실행한다.
3. URI 를 Vitest provided context 의 `databaseUrl` 로 worker 에 전달한다.
4. `setupFiles` 가 각 test module import 전에 URI 를 `DATABASE_URL` 로 설정한다.
5. 정상 종료와 setup 실패 모두 컨테이너를 자동 정리한다.

루트 `test:integration` 은 server workspace 로 위임하며 `--` 뒤의 focused file
인자를 그대로 Vitest 에 전달한다. Docker-compatible container runtime 은
필수지만 사용자가 Compose lifecycle 을 직접 관리하지 않는다.

### 안전장치

- `test-helpers/real-prisma.ts::assertTestDbUrl` — 파싱한 DATABASE_URL 의 username 과
  database pathname 이 모두 정확히 `kiditem_test` 가 아니면 throw. dev/prod DB 에
  TRUNCATE 실수 방지.
- `vitest.config.integration.ts` — `fileParallelism: false` + `isolate: false` 로 단일 fork serial 실행 (테스트 사이 reset 만 하면 충분).

## Sellpia Inventory And Rocket Verification Contract

Sellpia 수집과 재고 반영은 한 종류의 테스트로 증명하지 않는다. 각 위험은 판정 권한이
있는 가장 낮은 tier에서 고정한다.

| 위험 | 필수 증거 |
|---|---|
| 성공·실패·취소·마지막 성공 상태, 빈 전체 결과와 불완전 결과 구분, 실행 lease/heartbeat | shared/domain 및 원천 계약 tests |
| generation/fence/owner race, full-file rollback, duplicate/hash publication, Supply lock + attempt uniqueness | real PostgreSQL integration |
| DTO/auth role/organization context, controller action-body contract | server unit/E2E + IDOR/tenant scanners |
| Chrome extension login/HTML/workbook/timeout/focus behavior | Node extension contract tests; 실제 Chrome는 safe smoke만 |
| shared collection start/join/cancel, exact completion before purchase/Rocket calculation, failure without old-stock fallback, active-route UI, and intentionally retired URL absence | React/Vitest active-route behavior tests; `apps/web/src/app/__tests__/retired-sidebar-routes.spec.ts` plus the production web build for retired URLs |
| `MasterProduct.currentStock` single writer | `sellpia-authoritative-inventory-contract.test.mjs` scanner |
| Rocket confirmation is idempotent, generation/recipe-fenced, concurrency-safe, releasable, and has no provider/stock-write lane | Rocket confirmation PostgreSQL integration, server policy/service tests, workbook contract, and `rocket-purchase-decision-boundary.spec.ts` |
| schema/data migration/generated docs | `db:push`, Prisma generate, data migration up twice/status, ERD sync gate |

Release verification must distinguish three evidence classes in its report:

- **Executed live**: a safe action actually performed in the current local
  KidItem/Chrome environment.
- **Recorded real E2E**: a prior task's preserved, identifiable real collection
  and publication evidence that was not repeated in the current run.
- **Deterministic test-backed**: unit/integration/contract behavior, especially
  destructive failure/race/provider cases that must not be induced live.

Do not label a deterministic test as a live provider result. Live Chrome checks
must not expose cookies, passwords, tokens, workbook contents, base64, or raw
provider responses. Do not induce actual stock publication, external purchase,
or marketplace submission merely to increase E2E coverage. Use the recorded real
Sellpia download/publication evidence and deterministic tests when repeating the
flow would mutate operator data.

Focused release commands are maintained in
[`docs/runbooks/sellpia-inventory-freshness.md`](runbooks/sellpia-inventory-freshness.md).
Every backend release check still requires a Nest boot confirmation, but when a
watch server already owns port 4000 verify that listener instead of starting a
duplicate persistent server.

## CI 통합

`develop`/`main`/`release/office` 대상 PR은 대기 시간을 줄이기 위해
`.github/workflows/pr-checks.yml`에서 정적 계약, 스크립트 계약 테스트, Gateway 단위 검증,
Shared·server·extension 단위 테스트만 수행한다.
provider runtime staging과 self-contained .NET publish는 정확한 원격 SHA를 선택한
`npm run deploy:office:local`이 Windows Office 호스트에서 수행한다.
PR 작성자는 `CLAUDE.md`의 변경 유형별 검증과 PR body guard를 로컬에서 완료한 뒤
공유한다. `Develop Validation` 전체 suite는 필요할 때 `develop`에서 수동 실행한다.

| Workflow / Job | 실행 시점 | 역할 |
| --- | --- | --- |
| `PR Checks / PR hygiene` | `develop`, `main`, `release/office` 대상 PR | PR diff whitespace와 AGENTS hygiene 검증 |
| `PR Checks / Gateway fast checks` | 동일 PR | lifecycle script 없는 install, Gateway가 소비하는 Shared 런타임 진입점과 Gateway build, Gateway unit tests |
| `PR Checks / Shared and server unit tests` | 동일 PR | lifecycle script 없는 install, Prisma client 생성, runner/templates build 뒤 shared·server vitest, Shared JS 빌드(DTS 제외) 뒤 확장 `node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs` 실행. PostgreSQL 통합 spec은 제외 |
| `PR Checks / Script contract tests` | 동일 PR | lifecycle script 없는 install, Prisma client 생성, Shared JS 빌드(DTS 제외), `origin/release/office`를 depth 1로 fetch해 기존 행이 막을 스키마 변경마다 `scripts/cutover-blocker-coverage.json` 항목이 있는지 DB 없이 확인(`check-cutover-blocker-coverage.mjs`), ripgrep 설치 뒤 `npm run test:scripts`(scripts vitest와 `node --test`) 실행 |
| `Develop Validation / Develop full validation` | `develop`에서 수동 실행 | 한 번의 dependency install 뒤 deployable workspace 전체 build(heap 4096MB), web/extension tests, real PostgreSQL integration suite 실행 |

`Develop Validation` 은 `develop` 누적 HEAD에 대해 필요할 때 수동으로 실행한다.
같은 ref의 더 새 수동 실행은 이전 실행을 취소한다. 이 job 은 아래 workspace build와
unit/extension suite를 수행한 뒤 Testcontainers의 동적 Postgres lifecycle로 통합
테스트를 실행한다.

```bash
NODE_OPTIONS=--max-old-space-size=4096 npm run build --workspace=packages/shared
NODE_OPTIONS=--max-old-space-size=4096 npm run build --workspace=packages/templates
NODE_OPTIONS=--max-old-space-size=4096 npm run build --workspace=packages/copilotkit-sqlite-runner
NODE_OPTIONS=--max-old-space-size=4096 npm run build --workspace=apps/server
NODE_OPTIONS=--max-old-space-size=4096 npm run build --workspace=apps/web
npm exec --workspace=apps/web vitest -- run
node --test extensions/tests/*.test.mjs extensions/tests/*/*.test.mjs
npm run test:integration
```

workspace build 단계는 heap 을 4096MB 로 올린다. `packages/shared` 의 tsup DTS
worker 가 runner 기본값에서 `ERR_WORKER_OUT_OF_MEMORY` 로 죽기 때문이다. server 와
web 은 `.d.ts` 가 필요하므로 PR 체크처럼 DTS 를 빼는 방식은 쓸 수 없다.

검증 실패는 Office 배포 또는 `main` promotion 전에 fix-forward 한다. 최종 Office
배포는 `origin/release/office`의 clean exact-SHA worktree에서 API/web/Gateway를 함께
만들고 VERSION, image ID, Git SHA, Gateway hash/runtime contract를 검증한다. 명시적으로
승인된 incident ref는 임시 복구에만 사용하며 release 병합과 재배포 전까지 status가
provisional drift를 표시한다.

## FAQ

**Q. 왜 기존 mock 테스트를 지우지 않았나?**
- Mock 은 msec 단위로 분기 커버리지 확보. Real 은 race 가 필요한 특정 시나리오에만.
- 둘 다 있는 편이 피드백 속도 + 정확성 balance.

**Q. Tier 3 느려지면?**
- `fileParallelism: false` + `isolate: false` 유지 → fork 재사용으로 overhead 최소.
- 파일당 describe 는 소수로 유지, 각 `beforeEach` 는 `TRUNCATE` 1회만.
- 병렬 실행 원하면 별도 test DB schema 사용 (향후 확장 가능성).

**Q. Windows 에서 동작하나?**
- Node/Testcontainers 기반이므로 Docker Desktop 같은 compatible container runtime 이
  있으면 동일 command 로 동작한다. shell 전용 `DATABASE_URL=...` prefix 는 쓰지 않는다.
