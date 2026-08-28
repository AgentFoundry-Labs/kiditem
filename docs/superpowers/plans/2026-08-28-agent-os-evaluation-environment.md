# Agent OS Evaluation Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a versioned Agent OS business-evaluation environment that keeps natural model prompts separate from hidden deterministic grading and production runtime assets.

**Architecture:** A development-only `evals/agent-os` directory owns strict JSON cases, fixture descriptors, normalized evidence contracts, deterministic graders, and a Node runner. Existing implementation-local tests continue to own runtime correctness, while generated evidence stays in `.tmp/agent-evals` and the retired Operator fixtures are deleted.

**Tech Stack:** Node.js 22 built-ins, Node test runner, JSON case definitions, existing npm scripts.

---

### Task 1: Lock the repository and case boundary

**Files:**
- Create: `evals/agent-os/tests/eval-environment.test.mjs`
- Create: `evals/agent-os/contracts/eval-case.mjs`
- Create: `evals/agent-os/fixtures/fixtures.json`
- Create: `evals/agent-os/cases/sourcing/recommendation-evidence-read.json`
- Create: `evals/agent-os/cases/sourcing/candidate-ingest.json`
- Create: `evals/agent-os/cases/sourcing/products-delegation.json`
- Create: `evals/agent-os/cases/sourcing/known-duplicate.json`
- Create: `evals/agent-os/cases/sourcing/candidate-approval-denied.json`
- Create: `evals/agent-os/cases/sourcing/scrape-failure.json`
- Create: `evals/agent-os/cases/supply/purchase-order-submit.json`
- Create: `evals/agent-os/cases/runtime/general-chat-no-tool.json`
- Create: `evals/agent-os/cases/runtime/two-turn-restart.json`
- Create: `evals/agent-os/harness/run-eval.mjs`
- Modify: `package.json`
- Modify: `.dockerignore`
- Delete: `agent-config/evals/operator-decisions/*.json`

- [x] **Step 1: Write the failing CLI and repository-boundary test**

Create a Node test that runs `node evals/agent-os/harness/run-eval.mjs --validate`,
requires exit status zero, requires `agent-config/evals` to be absent, requires
`.dockerignore` to exclude `evals/`, and requires the package entrypoints
`eval:agent-os` and `test:agent-evals`.

- [x] **Step 2: Run the test and verify RED**

Run: `rtk node --test evals/agent-os/tests/eval-environment.test.mjs`

Expected: FAIL because the evaluation runner and repository boundary do not yet
exist.

- [x] **Step 3: Implement the strict case registry and boundary**

Implement `loadEvalCases()` with explicit allowed keys, strict nested object
validation, fixture-variable validation, duplicate-ID rejection, and forbidden
authoring-field scanning. Add the nine natural-language cases and fixture
descriptors. The runner implements `--validate`, `--list`, and `--prompt`; list
output exposes only case ID, suite, fixture, provider, model, effort, and trial
count, while prompt output exposes only rendered natural messages.

Delete the retired Operator JSON fixtures, add `evals/` to `.dockerignore`, and
add these root scripts:

```json
"eval:agent-os": "node evals/agent-os/harness/run-eval.mjs",
"test:agent-evals": "node --test evals/agent-os/tests/*.test.mjs"
```

- [x] **Step 4: Run the test and verify GREEN**

Run: `rtk npm run test:agent-evals`

Expected: PASS with all cases accepted and no production-runtime eval path.

### Task 2: Grade normalized evidence without storing transcripts

**Files:**
- Modify: `evals/agent-os/tests/eval-environment.test.mjs`
- Create: `evals/agent-os/contracts/trial-evidence.mjs`
- Create: `evals/agent-os/graders/business-outcome.mjs`
- Modify: `evals/agent-os/harness/run-eval.mjs`

- [x] **Step 1: Write failing grader and sanitization tests**

Add tests proving that one hard-invariant violation fails the whole run, two of
three normal completions satisfy a capability case, final resource deltas and
unordered capability alternatives are graded, and any nested key containing
`token`, `bearer`, `cookie`, `credential`, `reasoning`, `transcript`, or raw
provider payload is rejected.

- [x] **Step 2: Run the tests and verify RED**

Run: `rtk npm run test:agent-evals`

Expected: FAIL because evidence parsing and grading are not implemented.

- [x] **Step 3: Implement normalized evidence parsing and grading**

Implement strict trial/run evidence parsing and `gradeEvalRun()`. Hard
invariants are required on every trial; capability policies accept any declared
unordered alternative; exact final deltas and the minimum completed-trial count
must match. Add `--grade <absolute-or-relative-json-path>` to print a sanitized
summary and return nonzero on evaluation failure.

- [x] **Step 4: Run the tests and verify GREEN**

Run: `rtk npm run test:agent-evals`

Expected: PASS.

### Task 3: Document the executable evaluation workflow

**Files:**
- Create: `evals/agent-os/README.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/superpowers/plans/2026-08-26-agent-os-global-chat-panel-and-history.md`

- [x] **Step 1: Document ownership and commands**

Document that natural business prompts and hidden graders live in
`evals/agent-os`, generated evidence lives in `.tmp/agent-evals`, deterministic
owner tests stay co-located, and `agent-config` is provider-visible runtime data
only. Include exact validate, list, grade, and test commands.

- [x] **Step 2: Link Task 9 to the executable cases**

Update the active KID-25 Task 9 text to reference the case IDs and state that
the model receives only each natural user prompt; request keys, expected tool
paths, mutations, and database assertions remain hidden grader/harness inputs.

- [x] **Step 3: Run final focused gates**

Run:

```bash
rtk npm run eval:agent-os -- --validate
rtk npm run eval:agent-os -- --list
rtk npm run eval:agent-os -- --prompt sourcing.candidate-ingest.v1 --var supplierUrl=https://supplier.example/item/qa
rtk npm run test:agent-evals
rtk npm run check:scripts-inventory
rtk npm run check:agent-os-contraction -- --enforce
rtk npm run check:agents-hygiene
```

Expected: every command passes without creating tracked run artifacts.
