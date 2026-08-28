# Agent OS Evaluation Environment Design

## Goal

Make Agent OS business evaluation a versioned, repeatable product asset without
mixing hidden evaluation criteria into provider runtime configuration or
turning deterministic owner-contract tests into model evaluations.

## Boundary

`evals/agent-os` owns natural-language cases, disposable fixture descriptors,
hidden grading policy, deterministic evidence grading, and the development
runner. It is development-only and is excluded from production Docker build
contexts.

The following remain outside that directory:

- `agent-config` contains only provider-visible runtime prompts, skills, and
  output schemas.
- Owner idempotency, approval, organization isolation, race, and restart
  contracts remain co-located with their production implementations.
- `scripts/qa-agent-os-clean-cutover.mjs` continues to own isolated PostgreSQL
  and application bootstrapping.
- Generated trial evidence lives below `.tmp/agent-evals` and is never tracked.

This is a directory and runner boundary, not a new application, service,
database model, or transcript store.

## Versioned Structure

```text
evals/agent-os/
├── README.md
├── cases/
│   ├── sourcing/
│   └── runtime/
├── contracts/
├── fixtures/
├── graders/
├── harness/
└── tests/
```

Cases are strict JSON documents so product and domain owners can review prompts
and hidden success criteria without reading the runner. Runtime code uses only
Node built-ins; the environment does not introduce an evaluation framework or
a second package manager boundary.

## Case Contract

Each case contains:

- a stable versioned ID and capability or regression suite classification;
- a natural user prompt template;
- a disposable fixture ID and required template variables;
- explicit provider, model, effort, and trial count;
- scripted user behavior limited to approval, denial, or clarification;
- hidden capability policy, hard invariants, final domain deltas, and minimum
  normal-completion count.

The parser rejects unknown keys and authoring fields that would leak an answer
or implementation trajectory, including `rawOutput`, `expectedToolSequence`,
and model-visible `requestKey`. Capability policy may accept multiple valid
sets, but does not prescribe one exact ordered tool trajectory.

The initial risk-based suite covers grounded Sourcing reads, approved candidate
ingestion, an existing-candidate no-op, denied approval, incomplete scraping,
Sourcing-to-Products delegation, providerless purchase-order submission,
general conversation without a business capability, and two-turn/restart
continuity. It intentionally does not create one live prompt per catalog entry:
catalog publication, MCP wire contracts, owner idempotency, and lifecycle races
remain deterministic gates.

## Trial Evidence And Grading

The evaluator accepts only a normalized, sanitized evidence record. It may
contain case/trial, model/effort, opaque Conversation/Turn/Execution
correlations, capability keys, canonical input hashes, sanitized
Approval/Operation/resource references, invariant observations, and final
domain counts.

It rejects secret-like fields, cookies, bearer/token values, provider payloads,
private reasoning, and transcripts. Hard invariants are fail-closed and must
pass every trial. Normal completion uses the case threshold, initially two of
three trials. Grading evaluates the final business outcome and unordered
capability policy rather than exact prose or a single tool sequence.

## Legacy Cutover

`agent-config/evals/operator-decisions` is removed rather than migrated. Those
fixtures encode the retired Operator decision model and exact golden output,
have no live runner, and currently sit under a runtime image copy boundary.

The new evaluation directory is explicitly ignored by the server Docker build
context. A repository contract test prevents either the legacy path or hidden
evaluation cases from returning to `agent-config`.

## Verification

The environment is complete when:

- `npm run eval:agent-os -- --validate` validates every case and fixture;
- `npm run eval:agent-os -- --list` lists the versioned cases without hidden
  grading details;
- `npm run eval:agent-os -- --prompt <case-id>` renders only natural messages
  and fails when a required fixture variable is missing;
- `npm run test:agent-evals` proves strict case parsing, hard-invariant grading,
  threshold behavior, sanitization, legacy removal, and Docker exclusion;
- existing script inventory and Agent OS architecture gates still pass.
