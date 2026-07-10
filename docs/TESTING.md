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

새 파일은 주변 파일군의 관습을 따른다. 서버와 scripts 는 config 가 명시한
`*.spec.ts` / `__tests__` 규칙에서 벗어나지 않는다. 웹은 Vitest 기본 include
때문에 `*.test.ts` 도 실행되지만, 새 테스트는 주변 route 가 이미 `*.test.ts`
를 쓰는 경우가 아니면 `*.spec.ts` 를 우선한다.

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

## 기존 테스트 정리 기준

리팩터링 PR 은 기존 테스트도 함께 정리할 수 있다. 단, 삭제는 "테스트가
거슬린다"가 아니라 "같은 위험을 더 나은 테스트나 gate가 이미 보호한다"는
근거가 있어야 한다.

정리 대상:

- 구현 세부에 강결합된 mock interaction 테스트
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
npx vitest run src/inventory/picking
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

- `automation/adapter/out/panel-event/__tests__/panel-pr3.pg.integration.spec.ts` — Alert promote race (`alert.updateMany` + `actionTask.create` P2002)
- `automation/application/service/__tests__/action-board-claim.pg.integration.spec.ts` — ActionTask claim/unclaim race
- `automation/application/service/__tests__/action-board-mutations.pg.integration.spec.ts` — ActionTask mutation tenant scope

각 파일은 mock 시뮬레이션 대응 파일(`*.spec.ts`) 과 **공존**한다. Mock 은 fast smoke, real 은 동시성 정확성.

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

- `test-helpers/real-prisma.ts::assertTestDbUrl` — DATABASE_URL 에 `kiditem_test` 가
  포함되지 않으면 throw. dev/prod DB 에 TRUNCATE 실수 방지.
- `vitest.config.integration.ts` — `fileParallelism: false` + `isolate: false` 로 단일 fork serial 실행 (테스트 사이 reset 만 하면 충분).

## CI 통합

PR 은 `.github/workflows/pr-checks.yml` 에서 최소 운영 게이트를 통과해야 한다.

| Job | 역할 |
|---|---|
| `GitHub Actions lint` | workflow syntax/actionlint 검증 |
| `Deploy shell lint` | 배포 shell script `bash -n` + `shellcheck` |
| `Lint apps/server`, `Lint apps/web` | workspace lint |
| `Build apps/server`, `Build apps/web`, `Build packages/shared` | deployable package build |
| `PR review guardrails` | reconstruction/release/convention/script scanner |

Real Postgres integration 은 아직 모든 PR 의 기본 게이트가 아니다. DB 동시성,
tenant isolation, raw SQL, migration 위험을 건드리는 PR 은 아래 명령을 focused
gate 로 실행하고 PR 본문에 기록한다.

```bash
npm run test:integration
```

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
