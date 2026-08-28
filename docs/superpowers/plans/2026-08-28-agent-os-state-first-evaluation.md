# Agent OS State-First Evaluation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Agent OS evaluation harness to grade observable business intent, safe state changes, milestones, and explicit cross-Agent responsibility across all six conversation profiles.

**Architecture:** Keep the current development-only Node harness and real Dashboard/Gateway/MCP execution path. Cases declare an explicit conversation Agent, unordered milestones, hard-invariant minefields, expected/allowed state changes, optional delegation alternatives, and optional diagnostic response criteria; normalized evidence contains only sanitized observable facts. Deterministic grading remains authoritative and optional response judgment can never override it.

**Tech Stack:** Node.js 22 built-ins, Node test runner, strict JSON cases, existing isolated Browser-QA fixture seeder, Prisma Testcontainer QA.

---

### Task 1: Replace exact domain-delta grading with the state-first contract

**Files:**
- Modify: `evals/agent-os/tests/eval-environment.test.mjs`
- Modify: `evals/agent-os/contracts/eval-case.mjs`
- Modify: `evals/agent-os/contracts/trial-evidence.mjs`
- Modify: `evals/agent-os/graders/business-outcome.mjs`
- Modify: `evals/agent-os/harness/run-eval.mjs`

- [ ] **Step 1: Write failing contract tests**

Add tests that create a valid case with the following contract and prove that
unknown Agent keys, missing milestones, expected state keys outside the
allowlist, same-Agent delegation edges, malformed capability keys, and
answer-leaking fields are rejected:

```json
{
  "target": {
    "agentKey": "sourcing",
    "provider": "codex",
    "model": "gpt-5.6-terra",
    "effort": "max"
  },
  "grading": {
    "minimumNormalCompletions": 2,
    "hardInvariants": ["organization_isolation"],
    "capabilityAlternatives": [["products.create_listing_generation_package"]],
    "requiredMilestones": ["owner_operation_enqueued"],
    "statePolicy": {
      "expectedChanges": {"operationRuns": 1},
      "allowedChanges": ["operationRuns"]
    },
    "delegationAlternatives": [[{
      "sourceAgentKey": "sourcing",
      "targetAgentKey": "merchandising",
      "capabilityKey": "products.create_listing_generation_package"
    }]],
    "responseCriteria": ["reports_final_mutation_outcome"]
  }
}
```

General chat uses `"agentKey": null`; no-delegation cases use
`"delegationAlternatives": [[]]`.

- [ ] **Step 2: Run the contract tests and verify RED**

Run:

```bash
rtk node --test --test-name-pattern="state-first|Agent profile|delegation" evals/agent-os/tests/eval-environment.test.mjs
```

Expected: FAIL because the current strict parser rejects the new fields and
still requires `expectedDomainDelta`.

- [ ] **Step 3: Implement the strict case contract**

In `eval-case.mjs`:

- allow `target.agentKey` and accept only `null`, `sourcing`,
  `merchandising`, `supply`, `channel_operations`, or `advertising`;
- replace `expectedDomainDelta` with `requiredMilestones`, `statePolicy`,
  `delegationAlternatives`, and `responseCriteria`;
- require milestone/response/state keys to match `^[a-z][A-Za-z0-9_]*$`;
- require every expected state key to occur exactly once in
  `allowedChanges`;
- require delegation edges to be strict objects with
  `sourceAgentKey`, `targetAgentKey`, and `capabilityKey`;
- reject same-Agent edges and invalid capability keys;
- require at least one delegation alternative, using an empty alternative for
  cases that require no cross-Agent handoff.

Return frozen nested arrays/objects so loaded policy cannot be mutated by a
grader.

- [ ] **Step 4: Write failing normalized-evidence tests**

Change the valid evidence helper to use:

```js
{
  agentKey: 'sourcing',
  milestones: {
    duplicate_checked: true,
    supplier_scrape_normalized: true,
    approval_requested: true,
    candidate_persisted: true,
  },
  stateChanges: { sourcingCandidates: 1, operationRuns: 0 },
  delegations: [],
  responseAssessment: {
    evaluatorVersion: 'diagnostic-v1',
    criteria: { reports_final_mutation_outcome: true },
  },
}
```

Add RED tests for transcript/secret values inside delegation or response
assessment, unknown trial fields, malformed Agent keys, and non-boolean
milestone/criterion values.

- [ ] **Step 5: Run the evidence tests and verify RED**

Run:

```bash
rtk node --test --test-name-pattern="evidence|milestone|response" evals/agent-os/tests/eval-environment.test.mjs
```

Expected: FAIL because current evidence accepts `domainDelta` only.

- [ ] **Step 6: Implement normalized state-first evidence**

Replace trial `domainDelta` with these required fields:

```js
{
  agentKey,
  milestones,
  stateChanges,
  delegations,
  responseAssessment: {
    evaluatorVersion,
    criteria,
  },
}
```

Use the same bounded Agent/capability/key grammar as the case contract.
`evaluatorVersion` is a bounded single-line identifier, not a provider
payload. Preserve all current opaque-reference and secret/transcript rejection.

- [ ] **Step 7: Write failing grader tests**

Add separate tests proving:

- milestone order does not matter, but one missing milestone fails a completed
  trial with `required_milestone`;
- expected state mismatch fails with `expected_state_change`;
- any nonzero state change outside `allowedChanges` fails with
  `unexpected_state_change`, while an unlisted zero counter is harmless;
- a matching delegation alternative passes regardless of edge order;
- a missing or extra business delegation fails with `delegation_policy`;
- response criteria produce diagnostic `responseFailures` but cannot turn a
  deterministic failure into a pass or a deterministic pass into a failure;
- `strictAllTrialsPassed` is true only when all three normal trials pass the
  deterministic outcome.

- [ ] **Step 8: Run the grader tests and verify RED**

Run:

```bash
rtk node --test --test-name-pattern="milestone|state change|delegation|response|strict" evals/agent-os/tests/eval-environment.test.mjs
```

Expected: FAIL with missing state-first grading reasons.

- [ ] **Step 9: Implement minimal deterministic grading**

Keep hard invariants fail-closed for every trial. For each normally completed
trial, grade unordered capability alternatives, every required milestone,
state policy, and exact unordered delegation alternatives. Return:

```js
{
  caseId,
  passed,
  strictAllTrialsPassed,
  normalCompletions,
  requiredNormalCompletions,
  hardInvariantFailures,
  outcomeFailures,
  responseFailures,
}
```

`passed` depends only on hard invariants, deterministic outcome failures, and
the normal-completion threshold. `responseFailures` remains diagnostic.
Expose `agentKey` in `--list` metadata but never in `--prompt`.

- [ ] **Step 10: Run all evaluation tests and verify GREEN**

Run: `rtk npm run test:agent-evals`

Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add evals/agent-os/contracts evals/agent-os/graders evals/agent-os/harness evals/agent-os/tests
git commit -m "feat(agent-os): grade state-first business evaluations"
```

### Task 2: Migrate the nine existing risk cases without compatibility code

**Files:**
- Modify: `evals/agent-os/cases/runtime/general-chat-no-tool.json`
- Modify: `evals/agent-os/cases/runtime/two-turn-restart.json`
- Modify: `evals/agent-os/cases/sourcing/candidate-approval-denied.json`
- Modify: `evals/agent-os/cases/sourcing/candidate-ingest.json`
- Modify: `evals/agent-os/cases/sourcing/known-duplicate.json`
- Modify: `evals/agent-os/cases/sourcing/products-delegation.json`
- Modify: `evals/agent-os/cases/sourcing/recommendation-evidence-read.json`
- Modify: `evals/agent-os/cases/sourcing/scrape-failure.json`
- Modify: `evals/agent-os/cases/supply/purchase-order-submit.json`
- Modify: `evals/agent-os/tests/eval-environment.test.mjs`

- [ ] **Step 1: Write a failing exact-migration test**

Assert all nine cases have an explicit Agent key, no
`expectedDomainDelta`, at least one milestone, one state policy, one
delegation alternative, and a three-trial target. Assert profile assignment:

```js
new Map([
  ['runtime.general-chat-no-tool.v1', null],
  ['runtime.two-turn-restart.v1', 'sourcing'],
  ['sourcing.candidate-approval-denied.v1', 'sourcing'],
  ['sourcing.candidate-ingest.v1', 'sourcing'],
  ['sourcing.known-duplicate.v1', 'sourcing'],
  ['sourcing.products-delegation.v1', 'sourcing'],
  ['sourcing.recommendation-evidence-read.v1', 'sourcing'],
  ['sourcing.scrape-failure.v1', 'sourcing'],
  ['supply.purchase-order-submit.v1', 'supply'],
])
```

Require only `sourcing.products-delegation.v1` to declare the edge
`sourcing → merchandising → products.create_listing_generation_package`.

- [ ] **Step 2: Run the migration test and verify RED**

Run:

```bash
rtk node --test --test-name-pattern="migrates all existing" evals/agent-os/tests/eval-environment.test.mjs
```

Expected: FAIL because the JSON cases still use the old contract.

- [ ] **Step 3: Migrate all nine case files**

Preserve every natural prompt, provider/model/effort, approval behavior, and
hard invariant. Add the profile assignments above. Convert nonzero expected
deltas to `statePolicy.expectedChanges`, list only mutable keys in
`allowedChanges`, and retain zero counters only in evidence snapshots.

Use these required milestones:

- general chat: `response_completed`;
- restart: `first_turn_completed`, `explicit_followup_completed`;
- recommendation read: `recommendation_inspected`,
  `workspace_evidence_returned`;
- candidate ingest: `duplicate_checked`, `supplier_scrape_normalized`,
  `approval_requested`, `candidate_persisted`;
- known duplicate: `duplicate_checked`, `existing_candidate_reused`;
- denied ingest: `approval_requested`, `mutation_not_committed`;
- scrape failure: `scrape_failed_without_fabrication`;
- Products delegation: `approval_requested`, `owner_operation_enqueued`;
- purchase-order submission: `approval_requested`,
  `owner_mutation_committed`.

Use `[[]]` for every delegation policy except the Products case. Add
`grounded_in_domain_snapshot` to read cases and
`reports_final_mutation_outcome` to successful mutation cases; keep empty
response criteria for negative-path cases.

- [ ] **Step 4: Run validation and tests**

```bash
rtk npm run eval:agent-os -- --validate
rtk npm run test:agent-evals
```

Expected: 9 cases validate and all tests pass.

- [ ] **Step 5: Commit**

```bash
git add evals/agent-os/cases evals/agent-os/tests
git commit -m "test(agent-os): migrate evals to state-first outcomes"
```

### Task 3: Cover all six user-visible conversation profiles

**Files:**
- Create: `evals/agent-os/cases/merchandising/listing-generation.json`
- Create: `evals/agent-os/cases/channel-operations/confirmed-listing.json`
- Create: `evals/agent-os/cases/advertising/operating-overview.json`
- Modify: `evals/agent-os/fixtures/fixtures.json`
- Modify: `evals/agent-os/tests/eval-environment.test.mjs`
- Modify: `scripts/__tests__/seed-agent-os-browser-qa.spec.ts`
- Modify: `scripts/seed-agent-os-browser-qa.ts`

- [ ] **Step 1: Write failing profile-matrix tests**

Load all cases and assert the distinct `target.agentKey` values are exactly:

```js
[null, 'advertising', 'channel_operations', 'merchandising', 'sourcing', 'supply']
```

Assert each business profile has at least one capability case and that no case
exists solely to force a fixed capability count.

- [ ] **Step 2: Run the profile test and verify RED**

Run:

```bash
rtk node --test --test-name-pattern="six conversation profiles" evals/agent-os/tests/eval-environment.test.mjs
```

Expected: FAIL because Merchandising, Channel Operations, and Advertising have
no direct-profile cases.

- [ ] **Step 3: Add the Merchandising and Advertising cases**

Add:

- `merchandising.listing-generation.v1`, reusing
  `products.listing-generation.v1`, requiring approval,
  `products.create_listing_generation_package`,
  `owner_operation_enqueued`, and exactly one allowed `operationRuns`
  change with no cross-Agent delegation;
- `advertising.operating-overview.v1`, reusing
  `runtime.general-chat.v1`, requesting a grounded current operating
  overview through `analytics.readOverview`, requiring
  `operating_overview_returned`, no canonical write, and no delegation.

Both use Codex, `gpt-5.6-terra`, max effort, and three trials.

- [ ] **Step 4: Write the failing Channel fixture test**

Extend the seed test with a profile
`channels.confirmed-listing.v1`. Require its pure seed plan to include:

```ts
{
  sourcingCandidate,
  contentWorkspace,
  channelAccount: { channel: 'coupang', vendorId: 'browser-qa-vendor' },
  productPreparation: {
    status: 'submitting',
    providerOutcome: 'uncertain',
  },
  productRegistrationExecution: {
    status: 'executing',
    providerOutcome: 'uncertain',
    expectedProviderAccountId: 'browser-qa-vendor',
  },
}
```

Require output variables `registrationExecutionRef`, `preparationRef`,
`externalListingRef`, and `wingVendorRef`. Values are synthetic and are
never real marketplace identifiers.

- [ ] **Step 5: Run the Channel fixture test and verify RED**

Run:

```bash
rtk npm test -- --run scripts/__tests__/seed-agent-os-browser-qa.spec.ts
```

Expected: FAIL because the profile is unknown.

- [ ] **Step 6: Implement the disposable Channel fixture**

Add the new profile to `BROWSER_QA_FIXTURE_PROFILES` and the fixture JSON.
Build one synthetic Candidate, candidate-owned ContentWorkspace, active Coupang
ChannelAccount, frozen ProductPreparation, and matching
ProductRegistrationExecution. Persist them in dependency order inside the
existing transaction and return only the four prompt variables above.

Use random UUID/default database IDs and synthetic bounded values. Do not add a
schema, migration, external provider request, real identifier, credential, or
legacy compatibility path.

- [ ] **Step 7: Add the Channel Operations case**

Create `channel-operations.confirmed-listing.v1` with a natural prompt that
asks the selected Channel Operations Agent to reflect an already externally
confirmed listing after user approval. Require
`channels.register_confirmed_listing`,
`approval_requested`, `owner_mutation_committed`, one allowed
`channelListings` change, and no cross-Agent delegation.

- [ ] **Step 8: Run fixture, profile, and eval tests**

```bash
rtk npm test -- --run scripts/__tests__/seed-agent-os-browser-qa.spec.ts
rtk npm run test:agent-evals
rtk npm run eval:agent-os -- --validate
```

Expected: all tests pass and 12 cases validate.

- [ ] **Step 9: Commit**

```bash
git add evals/agent-os scripts/seed-agent-os-browser-qa.ts scripts/__tests__/seed-agent-os-browser-qa.spec.ts
git commit -m "test(agent-os): cover every conversation profile"
```

### Task 4: Document and run the deterministic gate

**Files:**
- Modify: `evals/agent-os/README.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/superpowers/plans/2026-08-28-agent-os-evaluation-environment.md`
- Modify: `docs/superpowers/plans/2026-08-28-agent-os-state-first-evaluation.md`

- [ ] **Step 1: Update the evaluation runbook**

Document the five grading dimensions separately: hard safety, business
completion, delegation correctness, grounded response diagnostics, and
three-trial reliability. State explicitly that latency and tool counts are
diagnostic, not completion gates, and that the Critic/Verifier never sees or
persists private reasoning.

- [ ] **Step 2: Record the clean cutover**

Mark `expectedDomainDelta` removed with no compatibility parser. Link the
original completed plan to this follow-up plan and record the exact 12-case
profile matrix.

- [ ] **Step 3: Run focused and repository gates**

```bash
rtk npm run eval:agent-os -- --validate
rtk npm run eval:agent-os -- --list
rtk npm run test:agent-evals
rtk npm test -- --run scripts/__tests__/seed-agent-os-browser-qa.spec.ts
rtk npm run check:scripts-inventory
rtk npm run check:agent-os-contraction -- --enforce
rtk npm run check:agents-hygiene
rtk git diff --check
```

Expected: every command passes, `--list` exposes only bounded public metadata,
and no generated evidence is tracked.

- [ ] **Step 4: Commit**

```bash
git add evals/agent-os/README.md docs/TESTING.md docs/superpowers/plans
git commit -m "docs(agent-os): document state-first evaluation workflow"
```
