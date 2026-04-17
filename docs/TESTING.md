# Testing — 3-tier strategy

KidItem 은 테스트 실효성을 세 단계로 나눈다. 각 단계는 서로 다른 구성·속도·커버리지 특성을 가진다.

## 요약

| Tier | 명령 | 대상 | Prisma | 속도 | 파일 규칙 |
|---|---|---|---|---|---|
| **Unit** | `npx vitest run` | 단일 서비스/함수/adapter 로직 | mock (`mock-prisma.ts`) | <1s | `*.spec.ts` |
| **E2E (HTTP)** | `npm run test:e2e` (서버 전용) | NestJS app bootstrap + supertest HTTP | mock | ~3-10s | `*.e2e.spec.ts` (apps/server/e2e/) |
| **Integration (real DB)** | `npm run test:integration` | 실제 Postgres 동시성·트랜잭션·IDOR | **real** (docker-compose.test.yml) | ~1-3s | `*.pg.integration.spec.ts` |

## Tier 1 — Unit (mock)

대부분의 `*.spec.ts`. 빠른 피드백, 분기 커버리지, assertion 강화에 사용.

```bash
# 전체
npx vitest run --workspace=apps/server
# 특정
npx vitest run src/picking
```

**한계**: race / lock / 트랜잭션 isolation 검증 불가. `updateMany({ count: 0 })` 반환을 강제할 순 있지만, 실제 두 트랜잭션 경쟁에서 count 가 어떻게 나오는지는 **mock 으로 재현 불가** (mock Prisma 는 synchronous).

## Tier 2 — E2E (HTTP, mock Prisma)

`apps/server/e2e/*.e2e.spec.ts`. NestJS app 전체를 부팅하고 supertest 로 HTTP 경로 + DTO validation + guard + middleware 검증.

```bash
npm run test:e2e --workspace=apps/server
```

Prisma 는 여전히 mock 이므로 "HTTP 레이어 회귀" 위주. DB 쿼리 정확성은 `toHaveBeenCalledWith({ where: objectContaining({ companyId }) })` 같은 assertion 으로 간접 검증.

## Tier 3 — Integration (real Postgres)

`src/**/*.pg.integration.spec.ts`. **race guard · 동시성 · IDOR · 실제 트랜잭션 isolation** 이 필요한 시나리오 전용. 프로덕션 버그 재현 레벨.

### 실행 (원 스텝)

```bash
npm run db:test:up         # docker tmpfs Postgres (5434) 기동
npm run db:test:prepare    # prisma db push (schema 동기화)
npm run test:integration   # DATABASE_URL 주입 + vitest integration
npm run db:test:down       # 종료 + 볼륨 자동 소멸 (tmpfs)
```

### 언제 Tier 3 로 쓸 것인가

- **Race guard**: `updateMany({ where: { ..., field: null }, count })` 기반 atomic claim 패턴
- **P2002 동시 race**: `@@unique` 제약 걸린 트랜잭션 충돌
- **Multi-statement 트랜잭션**: `$transaction` 내부 롤백 동작
- **IDOR end-to-end**: 다른 companyId 로 쿼리 시 실제 row 격리

### 현재 커버 (2026-04-17)

- `panel/__tests__/panel-pr3.pg.integration.spec.ts` — Alert.promote race (`alert.updateMany` + `actionTask.create` P2002)
- `action-task/__tests__/action-task-claim.pg.integration.spec.ts` — ActionTask.claim/unclaim race

각 파일은 mock 시뮬레이션 대응 파일(`*.spec.ts`) 과 **공존**한다. Mock 은 fast smoke, real 은 동시성 정확성.

### Tier 3 추가 시 체크리스트

- 파일명 `*.pg.integration.spec.ts` (vitest unit config 에서 자동 제외)
- `makeTestPrisma()` + `resetDb()` + `seedBaseFixture()` 사용 (`src/test-helpers/real-prisma.ts`)
- `beforeEach` 에 reset + seed
- `afterAll` 에 `$disconnect`
- 안전장치: `assertTestDbUrl` 이 dev/prod DB 로 TRUNCATE 실수 차단

## 인프라 세부

### docker-compose.test.yml

- `kiditem-postgres-test` (port 5434) — dev DB(5433) 와 분리
- `tmpfs:/var/lib/postgresql/data` — 컨테이너 중지 시 자동 소멸. 매 CI run 에서 깨끗한 상태
- healthcheck + `--wait` 로 schema push 전 ready 보장

### 스크립트 (package.json)

| 스크립트 | 역할 |
|---|---|
| `db:test:up` | docker compose up -d --wait |
| `db:test:prepare` | `DATABASE_URL=5434 prisma db push --accept-data-loss` |
| `test:integration` | `DATABASE_URL=5434 npm run test:integration --workspace=apps/server` |
| `db:test:down` | docker compose down -v |

### 안전장치

- `test-helpers/real-prisma.ts::assertTestDbUrl` — DATABASE_URL 이 5434 또는 `kiditem_test` 포함 아니면 throw. dev DB 에 TRUNCATE 실수 방지.
- `vitest.config.integration.ts` — `fileParallelism: false` + `isolate: false` 로 단일 fork serial 실행 (테스트 사이 reset 만 하면 충분).

## CI 통합 (TODO)

현재 `.github/workflows/` 없음. 추가 시 Postgres service 컨테이너로 동일 compose 재사용 가능:

```yaml
# .github/workflows/test.yml (예시)
jobs:
  integration:
    services:
      postgres:
        image: postgres:17
        env: { POSTGRES_USER: kiditem_test, POSTGRES_PASSWORD: kiditem_test, POSTGRES_DB: kiditem_test }
        ports: ["5434:5432"]
        options: --health-cmd="pg_isready -U kiditem_test" ...
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run db:test:prepare
      - run: npm run test:integration
```

## FAQ

**Q. 왜 기존 mock 테스트를 지우지 않았나?**
- Mock 은 msec 단위로 분기 커버리지 확보. Real 은 race 가 필요한 특정 시나리오에만.
- 둘 다 있는 편이 피드백 속도 + 정확성 balance.

**Q. Tier 3 느려지면?**
- `singleFork` + `isolate: false` 유지 → fork 재사용으로 overhead 최소.
- 파일당 describe 는 소수로 유지, 각 `beforeEach` 는 `TRUNCATE` 1회만.
- 병렬 실행 원하면 별도 test DB schema 사용 (향후 확장 가능성).

**Q. Windows 에서 동작하나?**
- docker-compose + Node script 기반. Windows Docker Desktop 에서 동일 동작.
- 단, `DATABASE_URL=...` 형식 env prefix 는 sh 전용. Windows 에서는 `cross-env` 필요할 수 있음 (현재 미도입).
