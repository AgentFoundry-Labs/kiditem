# Agent OS business evaluations

This directory contains versioned business evaluations for the real KidItem
Agent OS product path. It is development-only and is not copied into production
images.

## Ownership

- `cases/` contains natural user messages plus hidden outcome policy.
- `fixtures/fixtures.json` names disposable QA fixture profiles and prompt
  variables. It never stores real credentials, account IDs, or marketplace
  payloads.
- `contracts/` strictly validates cases and normalized trial evidence.
- `graders/` deterministically grades hard invariants and final business
  outcomes.
- `harness/run-eval.mjs` validates, lists, renders, and grades evaluations.
- `tests/` protects the evaluation environment itself.

This runner does not implement another browser, provider, conversation, or
database runtime. Actual turns still run through the existing isolated
Dashboard QA environment. Owner idempotency, approval, race, restart, and
organization contracts remain in their implementation-local deterministic
tests.

## Current case suite

The 12 versioned cases cover all six user-visible conversation profiles:

- grounded recommendation and evidence reads;
- approved candidate ingestion;
- an existing-candidate duplicate no-op;
- candidate ingestion with user-denied approval;
- incomplete scraping without fabricated data or a write;
- Sourcing-to-Products owner delegation;
- direct Merchandising listing-generation work;
- providerless purchase-order submission with approval;
- Channel Operations confirmed-listing registration;
- an Advertising operating overview through a permitted cross-domain read;
- ordinary general chat without a KidItem business capability; and
- same-Conversation two-turn continuity across an explicit restart.

This is a risk-based business evaluation suite, not one live prompt per catalog
entry. Catalog admission, MCP discovery/invocation, owner wiring, strict schema,
idempotency, organization isolation, and lifecycle races stay in deterministic
contract or integration tests. A case is added to the live suite when model
judgment or user interaction materially affects the outcome.

## Commands

Validate all cases and fixture references:

```bash
npm run eval:agent-os -- --validate
```

List case metadata without exposing prompts or hidden grading policy:

```bash
npm run eval:agent-os -- --list
```

Render only the natural messages for a case:

```bash
npm run eval:agent-os -- \
  --prompt sourcing.candidate-ingest.v1 \
  --var supplierUrl=https://supplier.example/item/qa
```

Grade normalized evidence produced by an isolated QA run:

```bash
npm run eval:agent-os -- --grade .tmp/agent-evals/run.json
```

Run the environment contract tests:

```bash
npm run test:agent-evals
```

## Authoring rules

1. Write the request as a user would ask it. Do not name the expected tool
   sequence, request key, canonical hash, replay action, or deliberate input
   corruption in the message.
2. Put capability alternatives, required milestones, expected/allowed state
   changes, delegation alternatives, response criteria, and hard invariants in
   `grading`. These fields are never included by `--prompt`.
3. Use fixture variables for environment-specific supplier URLs and disposable
   resource references. Do not commit live values.
4. Require three trials for live model behavior unless a documented suite uses
   a different reliability policy. Hard invariants pass every trial; business
   completion follows the case threshold.
5. Add observed failures as the narrowest implementation-local deterministic
   regression test. Do not make the live prompt more prescriptive to force a
   pass.

The parser rejects unknown case fields and answer-leaking fields such as
`rawOutput`, `expectedToolSequence`, and `requestKey`. The retired
`expectedDomainDelta` contract has no compatibility parser.

## Grading dimensions

The harness reports the following dimensions separately:

1. **Hard safety:** every declared organization, approval, canonical-input,
   idempotency, and lifecycle invariant passes in every trial.
2. **Business completion:** an allowed capability set reaches every required
   milestone and produces the expected state changes without unlisted writes.
3. **Delegation correctness:** any required cross-Agent responsibility handoff
   matches one complete unordered alternative.
4. **Grounded response diagnostics:** a bounded Critic/Verifier assessment may
   describe answer quality, but cannot override deterministic state or safety.
5. **Three-trial reliability:** the normal release threshold is two successful
   business outcomes out of three, while `strictAllTrialsPassed` reports 3/3.

Latency, time to first event, turn count, capability-call count, and provider
subagent count are diagnostic only. They become gates only after a real user
problem establishes an explicit budget. A Critic or Verifier may inspect the
final answer ephemerally, but never sees or persists private reasoning.

## Evidence policy

Evidence may contain only:

- case/trial and explicit model/effort;
- bounded opaque Conversation/Turn/Execution references;
- capability keys and canonical input hashes;
- sanitized Approval/Operation/resource references;
- boolean hard-invariant and milestone observations;
- integer state changes;
- bounded Agent-to-Agent delegation edges; and
- bounded response-criterion booleans with an evaluator version.

Evidence must not contain credentials, cookies, bearer/token values, secrets,
provider payloads, prompts, transcripts, canonical inputs, or private
reasoning. Store generated runs only below `.tmp/agent-evals`; `.tmp` is already
ignored by Git.
