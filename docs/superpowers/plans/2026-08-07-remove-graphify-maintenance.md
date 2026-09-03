# Graphify Maintenance Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 공유 저장소에서 Graphify 생성물·생성기·문서·필수 검증 경로를 제거하고, Prisma 스키마에서 생성되는 `docs/ERD.md`와 `docs/erd/**`만 스키마 탐색 자료로 유지한다.

**Architecture:** Prisma 파일은 계속 유일한 스키마 원본이다. `npm run db:erd`가 전체 ERD와 도메인 ERD를 결정론적으로 함께 생성하며, 스키마 동기화 게이트는 두 종류 ERD가 모두 갱신되었는지 확인한다. Graphify는 공유 개발 계약에서 완전히 빠지고 `graphify-out/`은 재유입 방지를 위해 무시한다.

**Tech Stack:** Node.js 22, npm workspaces, Prisma 7, Node test runner, Vitest, Mermaid Markdown, Git hooks

## Global Constraints

- 이 계획은 제품 내 Hermes 런타임 제거와 독립된 `chore/remove-graphify-maintenance` 브랜치 및 PR로 실행한다. 기준 브랜치와 PR 대상은 `develop`이다.
- 모든 셸 명령은 저장소 규칙에 따라 `rtk`로 시작한다.
- Git 이력을 재작성하거나 대형 과거 blob을 purge하지 않는다. 이번 변경은 현재 트리와 향후 생성 계약만 정리한다.
- Prisma 모델이 source of truth이고 ERD는 탐색 자료라는 기존 계약을 유지한다.
- `docs/ERD.md`와 `docs/erd/**`는 직접 편집하지 않고 `npm run db:erd`로 재생성한다.
- 로컬 `.agents/`, `.claude/`, `.gstack/`, `.superpowers/`와 외부 Hermes 팀 설정은 이 PR에서 건드리지 않는다.
- 선택적인 개인 실험 결과가 다시 커밋되지 않도록 `.gitignore`의 `graphify-out/` tombstone은 유지한다.
- 스키마, 데이터, 배포 동작은 바꾸지 않는다. `VERSION` 증가, `db:push`, backfill, data migration은 필요 없다.

---

## 상태와 완료 계약

현재 저장소는 약 35MB의 Graphify 현재 산출물 8개를 추적하고, 전용 Python 생성기와 npm script, 대형 파일 hook 예외, 문서·runbook 검증 명령을 유지한다. 반면 실제 스키마 원본은 Prisma이고, 제품 코드·CI·에이전트가 Graphify JSON/HTML을 소비하지 않는다. 현재 동기화 게이트는 Prisma 변경 시 전체 ERD, 도메인 ERD, Graphify 중 하나만 바뀌어도 통과하므로 생성 자료 완전성도 보장하지 못한다.

완료 후 계약은 다음과 같다.

1. `npm run db:erd`만 전체·도메인 ERD를 생성한다.
2. Prisma 변경 PR은 `docs/ERD.md`와 하나 이상의 `docs/erd/**` 변경을 모두 포함해야 한다.
3. `graphify:schema`, 전용 생성기, `.graphifyignore`, Graphify 문서, 추적된 `graphify-out/**`이 없다.
4. Git hook·Knip·script inventory·AGENTS 문서에 Graphify 전용 예외가 없다.
5. Graphify 과거 이력은 그대로 두며 현재 checkout에서만 산출물을 삭제한다.

## 파일 책임 지도

| 경로 | 최종 책임 |
|---|---|
| `prisma/schema.prisma`, `prisma/models/**` | 스키마 source of truth |
| `scripts/generate-prisma-erd.mjs` | 전체 ERD와 도메인 ERD의 단일 결정론적 생성기 |
| `docs/ERD.md`, `docs/erd/**` | 커밋되는 읽기 전용 스키마 탐색 자료 |
| `scripts/check-schema-artifact-sync.mjs` | Prisma 변경과 두 ERD 계층의 동기화 게이트 |
| `.gitignore` | `graphify-out/` 재유입 방지 |

## Task 1: ERD-only 스키마 동기화 게이트 고정

**Files:**
- Modify: `scripts/__tests__/check-schema-artifact-sync.test.mjs`
- Modify: `scripts/check-schema-artifact-sync.mjs`

- [ ] **Step 1: 전체 ERD와 도메인 ERD를 모두 요구하는 실패 테스트 작성**

`scripts/__tests__/check-schema-artifact-sync.test.mjs`의 기존 “accepts ERD or graphify artifacts” 테스트를 아래 계약으로 교체한다.

```javascript
test('requires both the full and a domain ERD for Prisma model changes', () => {
  const onlyOverview = analyzeSchemaArtifactSync([
    'prisma/models/orders.prisma',
    'docs/ERD.md',
  ]);
  const onlyDomain = analyzeSchemaArtifactSync([
    'prisma/models/orders.prisma',
    'docs/erd/orders.md',
  ]);
  const complete = analyzeSchemaArtifactSync([
    'prisma/models/orders.prisma',
    'docs/ERD.md',
    'docs/erd/orders.md',
  ]);

  assert.equal(onlyOverview.hasGeneratedArtifacts, false);
  assert.equal(onlyDomain.hasGeneratedArtifacts, false);
  assert.equal(complete.hasGeneratedArtifacts, true);
  assert.equal(complete.erdOverviewChanged, true);
  assert.deepEqual(complete.domainErdFiles, ['docs/erd/orders.md']);
});

test('does not accept retired Graphify output as ERD evidence', () => {
  const result = analyzeSchemaArtifactSync([
    'prisma/models/orders.prisma',
    'graphify-out/schema/graph.json',
  ]);

  assert.equal(result.requiresGeneratedArtifacts, true);
  assert.equal(result.hasGeneratedArtifacts, false);
  assert.equal(result.erdOverviewChanged, false);
  assert.deepEqual(result.domainErdFiles, []);
});
```

merge 테스트의 입력과 기대값에서는 `graphify-out/schema/graph.json`을 제거하고 `docs/ERD.md`, `docs/erd/orders.md`의 중복 제거만 확인한다.

- [ ] **Step 2: 테스트가 현재의 느슨한 게이트 때문에 실패하는지 확인**

Run: `rtk node --test scripts/__tests__/check-schema-artifact-sync.test.mjs`

Expected: FAIL. 현재 구현은 전체 ERD 하나만 있어도 통과하고 Graphify 산출물도 유효한 증거로 인정한다.

- [ ] **Step 3: 분석 결과를 전체 ERD와 도메인 ERD로 분리**

`scripts/check-schema-artifact-sync.mjs`의 generated path 상수를 다음으로 교체한다.

```javascript
const SCHEMA_PATHS = ['prisma/schema.prisma', 'prisma/models/'];
const ERD_OVERVIEW_PATH = 'docs/ERD.md';
const DOMAIN_ERD_PATH = 'docs/erd/';
```

`analyzeSchemaArtifactSync`은 다음 구조를 반환하도록 바꾼다.

```javascript
export function analyzeSchemaArtifactSync(files) {
  const schemaFiles = files.filter((file) => matchesAnyPath(file, SCHEMA_PATHS));
  const erdOverviewChanged = files.includes(ERD_OVERVIEW_PATH);
  const domainErdFiles = files.filter((file) =>
    matchesAnyPath(file, [DOMAIN_ERD_PATH]),
  );
  const requiresGeneratedArtifacts = schemaFiles.length > 0;

  return {
    schemaFiles,
    erdOverviewChanged,
    domainErdFiles,
    requiresGeneratedArtifacts,
    hasGeneratedArtifacts:
      requiresGeneratedArtifacts &&
      erdOverviewChanged &&
      domainErdFiles.length > 0,
  };
}
```

- [ ] **Step 4: CLI 성공·실패 메시지를 ERD-only 계약으로 변경**

성공 시 다음 정보를 출력한다.

```javascript
console.log('check:schema-artifact-sync PASS');
console.log(`Schema files: ${result.schemaFiles.join(', ')}`);
console.log(
  `Generated ERDs: ${[ERD_OVERVIEW_PATH, ...result.domainErdFiles].join(', ')}`,
);
```

실패 메시지는 다음 두 줄로 고정한다.

```text
Missing generated ERD changes: docs/ERD.md and at least one docs/erd/** file are both required.
Run npm run db:erd, then commit the generated ERD output.
```

- [ ] **Step 5: 좁은 테스트와 실제 CLI 계약 검증**

Run: `rtk node --test scripts/__tests__/check-schema-artifact-sync.test.mjs`

Expected: PASS.

Run: `rtk npm run check:schema-artifact-sync -- --files prisma/models/orders.prisma,docs/ERD.md`

Expected: FAIL with the missing domain ERD message.

Run: `rtk npm run check:schema-artifact-sync -- --files prisma/models/orders.prisma,docs/ERD.md,docs/erd/orders.md`

Expected: PASS and both generated paths are reported.

- [ ] **Step 6: 커밋**

```bash
rtk git add scripts/check-schema-artifact-sync.mjs scripts/__tests__/check-schema-artifact-sync.test.mjs
rtk git commit -m "test: require complete ERD regeneration evidence"
```

## Task 2: `db:erd`를 유일한 탐색 자료 생성기로 정리

**Files:**
- Modify: `scripts/__tests__/generate-prisma-erd.test.mjs`
- Modify: `scripts/generate-prisma-erd.mjs`
- Modify (generated): `docs/ERD.md`
- Modify (generated): `docs/erd/advertising.md`
- Modify (generated): `docs/erd/agentos.md`
- Modify (generated): `docs/erd/ai.md`
- Modify (generated): `docs/erd/channels.md`
- Modify (generated): `docs/erd/core.md`
- Modify (generated): `docs/erd/finance.md`
- Modify (generated): `docs/erd/inventory.md`
- Modify (generated): `docs/erd/orders.md`
- Modify (generated): `docs/erd/sourcing.md`
- Modify (generated): `docs/erd/supply.md`
- Modify (generated): `docs/erd/system.md`

- [ ] **Step 1: 생성 문서가 Graphify 지시를 포함하지 않는다는 실패 테스트 추가**

overview 테스트에 다음 assertion을 추가한다.

```javascript
assert.match(markdown, /npm run db:erd/);
assert.doesNotMatch(markdown, /graphify/i);
```

`writeErd` 테스트에서는 생성된 index와 domain 문서 모두를 확인한다.

```javascript
assert.doesNotMatch(index, /graphify/i);
assert.doesNotMatch(inventory, /graphify/i);
```

- [ ] **Step 2: 현재 생성기 출력으로 실패 확인**

Run: `rtk node --test scripts/__tests__/generate-prisma-erd.test.mjs`

Expected: FAIL because both overview and domain headers still mention `graphify:schema`.

- [ ] **Step 3: 생성기 header를 단일 명령 계약으로 변경**

`generateErdMarkdown`에서는 다음 두 줄만 유지하고 별도 Graphify 문장을 삭제한다.

```javascript
'> Generated from `prisma/models/*.prisma`. Do not edit the diagram by hand.',
'> Regenerate this file with `npm run db:erd` after Prisma schema changes.',
```

domain header는 다음으로 바꾼다.

```javascript
'> Generated from `prisma/models/*.prisma`. Do not edit by hand.',
'> Regenerate with `npm run db:erd` after Prisma schema changes.',
```

- [ ] **Step 4: 모든 ERD를 생성기로 재생성**

Run: `rtk npm run db:erd`

Expected: `docs/ERD.md`와 기존 11개 `docs/erd/*.md`가 같은 Prisma 모델 집합으로 재생성되고 header에서 Graphify 문구만 사라진다. 수동으로 생성 파일을 수정하지 않는다.

- [ ] **Step 5: 테스트와 생성 결정성 검증**

Run: `rtk node --test scripts/__tests__/generate-prisma-erd.test.mjs`

Expected: PASS.

Run: `rtk npm run db:erd`

Run: `rtk git diff --check`

Expected: 두 번째 생성 실행으로 추가 비결정적 변경이 생기지 않고 whitespace 오류가 없다.

- [ ] **Step 6: 커밋**

```bash
rtk git add scripts/generate-prisma-erd.mjs scripts/__tests__/generate-prisma-erd.test.mjs docs/ERD.md docs/erd
rtk git commit -m "docs: make db erd the navigation generator"
```

## Task 3: Graphify 산출물과 전용 도구 체인 제거

**Files:**
- Modify: `.gitignore`
- Modify: `.githooks/pre-commit`
- Modify: `knip.jsonc`
- Modify: `package.json`
- Modify: `scripts/check-script-inventory.mjs`
- Modify: `tools/codex/skills/agents-md-audit/scripts/audit-agents-md.mjs`
- Delete: `.graphifyignore`
- Delete: `scripts/generate-schema-graphify.py`
- Delete: `graphify-out/schema/README.md`
- Delete: `graphify-out/schema/GRAPH_REPORT.md`
- Delete: `graphify-out/schema/graph.json`
- Delete: `graphify-out/schema/graph.html`
- Delete: `graphify-out/schema-consumers/README.md`
- Delete: `graphify-out/schema-consumers/GRAPH_REPORT.md`
- Delete: `graphify-out/schema-consumers/graph.json`
- Delete: `graphify-out/schema-consumers/graph.html`

- [ ] **Step 1: 전체 Graphify 출력 경로를 ignore tombstone으로 고정**

`.gitignore`의 세부 Graphify cache 규칙을 다음 두 줄로 교체한다.

```gitignore
# Retired local Graphify output must not return as a shared repository artifact.
graphify-out/
```

- [ ] **Step 2: 추적 산출물과 전용 생성기·ignore 파일 삭제**

```bash
rtk git rm -r graphify-out
rtk git rm .graphifyignore scripts/generate-schema-graphify.py
```

Expected: 삭제는 현재 branch에서 추적된 파일에만 적용된다. Git 이력은 재작성하지 않는다.

- [ ] **Step 3: script inventory가 아직 삭제된 생성기를 요구해 실패하는지 확인**

Run: `rtk npm run check:scripts-inventory`

Expected: FAIL because `scripts/check-script-inventory.mjs` still lists `generate-schema-graphify.py`.

- [ ] **Step 4: Graphify 전용 실행·예외 설정 제거**

다음을 함께 적용한다.

- `package.json`: `graphify:schema` script를 삭제한다.
- `scripts/check-script-inventory.mjs`: `generate-schema-graphify.py` 항목을 삭제한다.
- `.githooks/pre-commit`: 주석을 `Skip lockfiles and DB seed data.`로 바꾸고 네 개 `graphify-out/**` 대형 파일 예외 case를 삭제한다.
- `knip.jsonc`: root workspace ignore의 `graphify-out/**` 항목을 삭제한다. `.gitignore`가 재유입을 막는다.
- `tools/codex/skills/agents-md-audit/scripts/audit-agents-md.mjs`: excluded directory set에서 `graphify-out`을 삭제한다.

- [ ] **Step 5: 도구 체인과 추적 파일 제거 검증**

Run: `rtk npm run check:scripts-inventory`

Expected: PASS.

Run: `rtk git ls-files graphify-out .graphifyignore scripts/generate-schema-graphify.py`

Expected: no output.

Run: `rtk node --check scripts/check-script-inventory.mjs && rtk node --check tools/codex/skills/agents-md-audit/scripts/audit-agents-md.mjs`

Expected: PASS.

- [ ] **Step 6: 커밋**

```bash
rtk git add .gitignore .githooks/pre-commit knip.jsonc package.json scripts/check-script-inventory.mjs tools/codex/skills/agents-md-audit/scripts/audit-agents-md.mjs
rtk git commit -m "chore: remove Graphify artifacts and tooling"
```

## Task 4: 공유 지침·문서·runbook에서 Graphify 워크플로 제거

**Files:**
- Modify: `AGENTS.md`
- Modify: `prisma/AGENTS.md`
- Modify: `docs/README.md`
- Modify: `docs/TESTING.md`
- Modify: `scripts/README.md`
- Modify: `docs/runbooks/product-profitability-refresh.md`
- Modify: `docs/runbooks/sellpia-inventory-freshness.md`
- Modify: `docs/superpowers/specs/2026-07-12-sellpia-authoritative-inventory-cutover-design.md`
- Delete: `docs/GRAPHIFY.md`

- [ ] **Step 1: 루트와 Prisma 지침을 ERD-only로 변경**

다음 변경을 적용한다.

- `AGENTS.md` References 표의 Graphify row를 삭제한다. 기존 Prisma models row는 유지한다.
- `prisma/AGENTS.md`의 pull/data flow와 Verification 명령에서 `npm run graphify:schema`를 삭제한다.
- `prisma/AGENTS.md` 마지막 문장을 아래와 같이 바꾼다.

```text
`docs/ERD.md` and `docs/erd/**` are navigation aids only; verify important claims against Prisma and source code.
```

- [ ] **Step 2: 문서 index와 테스트 전략을 단일 생성 명령으로 변경**

`docs/README.md`에서 Graphify 표 row와 `GRAPHIFY.md` 설명을 삭제하고 Generated Navigation을 다음으로 정리한다.

```text
- `ERD.md` and `erd/*.md` are generated by `npm run db:erd`.
- Regenerate schema navigation after Prisma schema changes.
```

`docs/TESTING.md`의 schema/data migration row는 `ERD/Graphify sync gate`를 `ERD sync gate`로 바꾼다.

`scripts/README.md`는 다음처럼 바꾼다.

- `check-schema-artifact-sync.mjs`: `Prisma schema changes must include full and domain ERD updates`
- `generate-schema-graphify.py` row 삭제
- `generate-prisma-erd.mjs` row와 `npm run db:erd` 유지

- [ ] **Step 3: 과거 기능 runbook·spec의 현재 검증 명령 정정**

다음 줄만 제거하고 나머지 기능 검증은 유지한다.

- `docs/runbooks/product-profitability-refresh.md`: `GRAPHIFY_VIZ_NODE_LIMIT=7000 rtk npm run graphify:schema`
- `docs/runbooks/sellpia-inventory-freshness.md`: `rtk npm run graphify:schema`
- `docs/superpowers/specs/2026-07-12-sellpia-authoritative-inventory-cutover-design.md`: `npm run graphify:schema`

`docs/GRAPHIFY.md`는 현재 계약 전체가 폐기되므로 삭제한다. 대체 문서를 만들지 않는다. ERD 사용법은 `docs/README.md`와 `prisma/AGENTS.md`가 소유한다.

Run: `rtk git rm docs/GRAPHIFY.md`

- [ ] **Step 4: instruction hygiene와 stale reference 검증**

Run: `rtk npm run check:agents-hygiene`

Expected: PASS and active AGENTS chains remain below the size cap.

Run:

```bash
rtk rg -n -i 'graphify|graphify-out|graphify:schema' AGENTS.md prisma/AGENTS.md .githooks/pre-commit knip.jsonc package.json scripts docs tools/codex/skills/agents-md-audit --glob '!scripts/__tests__/**' --glob '!docs/superpowers/plans/**'
```

Expected: no output. Negative regression tests and this ignored implementation plan are intentionally excluded; `.gitignore` retains only the `graphify-out/` tombstone.

- [ ] **Step 5: 커밋**

```bash
rtk git add AGENTS.md prisma/AGENTS.md docs/README.md docs/TESTING.md scripts/README.md docs/runbooks/product-profitability-refresh.md docs/runbooks/sellpia-inventory-freshness.md docs/superpowers/specs/2026-07-12-sellpia-authoritative-inventory-cutover-design.md
rtk git commit -m "docs: remove Graphify workflow references"
```

## Task 5: 전체 검증과 PR 인계

**Files:**
- Verify only; no planned source edits

- [ ] **Step 1: 생성 결정성 확인**

Run: `rtk npm run db:erd`

Run: `rtk git status --short`

Expected: no output. 출력이 생기면 생성 파일을 검토하고 Task 2 커밋에 포함한 뒤 다시 실행한다.

- [ ] **Step 2: script와 convention 전체 게이트 실행**

Run: `rtk npm run test:scripts`

Expected: PASS.

Run: `rtk npm run check:conventions`

Expected: PASS, including AGENTS hygiene, script inventory, ERD sync, architecture, tenancy, and shared import gates.

Run: `rtk git diff --check`

Expected: PASS.

- [ ] **Step 3: 삭제 범위 최종 확인**

Run: `rtk git ls-files graphify-out .graphifyignore docs/GRAPHIFY.md scripts/generate-schema-graphify.py`

Expected: no output.

Run: `rtk git log --oneline origin/develop..HEAD`

Expected: 이 계획의 네 개 Graphify 전용 커밋만 보이고 unrelated commit이 없다.

- [ ] **Step 4: PR body guards 실행**

```bash
rtk npm run check:pr-reconstruction -- --base origin/develop --head HEAD
rtk npm run check:pr-release-contract -- --base origin/develop --head HEAD
```

Expected: PASS.

- [ ] **Step 5: `develop` 대상 PR 생성 및 live body 확인**

`.github/PULL_REQUEST_TEMPLATE.md`를 그대로 사용하고 다음 결정을 명시한다.

```text
Release decision: no VERSION change. No Prisma schema change, db:push, backfill, data migration, or dev-data update is required. This PR retires a generated navigation toolchain and keeps deterministic ERD output only.
```

PR을 만든 직후 다음으로 저장된 본문을 확인한다.

Run: `rtk gh pr view --json baseRefName,headRefName,commits,body --jq '{base: .baseRefName, head: .headRefName, commits: (.commits | length), body: .body}'`

Expected: base가 `develop`, head가 `chore/remove-graphify-maintenance`, commit 수가 예상과 일치하고 template 필수 section과 Release decision이 모두 존재한다.
