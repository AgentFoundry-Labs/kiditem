# Agent OS Evaluation Environment Design

## Goal

Evaluate whether the real KidItem Agent OS completes a user's business intent
safely and correctly. The primary result is an observable business outcome,
not token throughput, latency, an exact answer sentence, or one prescribed tool
sequence.

The environment remains a versioned product asset without mixing hidden
evaluation criteria into provider runtime configuration or turning
deterministic owner-contract tests into model evaluations.

## Chosen Approach

Deepen the existing `evals/agent-os` harness instead of importing a second
agent runtime or a benchmark framework.

The design combines the useful parts of established agent evaluations:

- tau-bench-style natural user simulation, final-state checking, and repeated
  trials;
- AppWorld-style expected changes plus an allowlist of permissible collateral
  changes;
- ToolSandbox-style positive milestones and fail-closed minefields;
- multi-agent benchmark-style explicit source/target responsibility checks;
- AgentEval-style Critic and Verifier roles only for user-visible response
  quality that deterministic state cannot judge.

KidItem's domain database and runtime records remain the source of truth. An
LLM judge cannot override a failed approval, organization, idempotency, owner,
or final-state assertion.

## Alternatives Rejected

### Import an external benchmark runtime

Running KidItem inside tau-bench, AppWorld, ToolSandbox, or another simulator
would introduce a second tool/runtime model and mostly evaluate the simulator
adapter. Their evaluation ideas are reused, but the production Dashboard,
Gateway, provider CLI, MCP, Approval, Operation, and owner-domain path remains
the system under test.

### Use an LLM judge as the main grader

This is flexible but can accept fabricated or unsafe outcomes and can correlate
with the model being evaluated. LLM graders are limited to bounded response
criteria after deterministic business grading.

### Create one live prompt per capability

Capability publication, strict schema admission, owner wiring, idempotency, and
organization fencing are cheaper and more reliable as deterministic tests. A
live scenario exists only when model judgment, conversation continuity, user
approval, or Agent responsibility materially affects the result.

## Boundary

`evals/agent-os` owns natural-language cases, disposable fixture descriptors,
hidden grading policy, normalized evidence contracts, deterministic grading,
and the development runner. It is development-only and is excluded from
production Docker build contexts.

The following remain outside that directory:

- `agent-config` contains only provider-visible runtime prompts, skills, and
  output schemas.
- Owner idempotency, approval, organization isolation, race, and restart
  contracts remain co-located with their production implementations.
- `scripts/qa-agent-os-clean-cutover.mjs` continues to own isolated PostgreSQL
  and application bootstrapping.
- Generated trial evidence lives below `.tmp/agent-evals` and is never tracked.
- Provider-native subagents remain Codex/Claude runtime behavior. The evaluator
  does not create KidItem Task, Attempt, transcript, or subagent persistence.

This is a directory and runner boundary, not a new application, service,
database model, transcript store, or agent orchestration layer.

## Evaluation Model

```text
Natural scenario
      ↓
real Dashboard Conversation + selected Agent profile
      ↓
Codex/Claude native orchestration and subagents
      ↓
KidItem MCP → Approval/Operation → owner domain
      ↓
sanitized observable facts + before/after domain snapshot
      ↓
deterministic oracle
      ├─ hard invariants (minefields)
      ├─ required milestones
      ├─ expected/allowed state changes
      └─ Agent delegation assertions
      ↓
optional response Critic → Verifier on disagreement/failure
```

The evaluator never inspects private reasoning or requires a particular number
of provider-native subagents. It checks only observable responsibility facts:
the selected conversation Agent, an explicit native delegation event when the
provider exposes one, the invoked owner capability, and the resulting domain
state. A scenario that requires explicit delegation fails closed when that
handoff cannot be observed; the harness does not infer a subagent from prose.

## Versioned Structure

```text
evals/agent-os/
├── README.md
├── cases/
│   ├── runtime/
│   ├── sourcing/
│   ├── merchandising/
│   ├── supply/
│   ├── channel-operations/
│   └── advertising/
├── contracts/
├── fixtures/
├── graders/
├── harness/
└── tests/
```

Cases are strict JSON documents so product and domain owners can review prompts
and hidden success criteria without reading the runner. Runtime code uses only
Node built-ins; the environment does not introduce an evaluation framework or
a second package-manager boundary.

## Case Contract

Each case contains:

- a stable versioned ID and capability or regression suite classification;
- a natural user prompt template;
- a disposable fixture ID and required template variables;
- an explicit conversation Agent profile, provider, model, effort, and trial
  count;
- scripted user behavior limited to approval, denial, or clarification;
- unordered capability alternatives;
- required observable milestones;
- hard invariants, which are the scenario's fail-closed minefields;
- expected state changes plus the complete allowlist of state keys that may
  change;
- optional explicit delegation alternatives; and
- optional bounded response criteria.

The parser rejects unknown keys and authoring fields that would leak an answer
or implementation trajectory, including `rawOutput`, `expectedToolSequence`,
and model-visible `requestKey`. Capability and delegation policies may accept
multiple valid unordered alternatives; neither prescribes one ordered tool
trajectory.

### Milestones

Milestones are positive business facts, not UI steps or tool-call positions.
Examples include evidence returned, duplicate decision made, approval
requested, owner mutation committed, Operation enqueued, and final state
visible in the product UI. Every required milestone must be observed for a
normally completed trial.

### Minefields

The existing hard invariants are the minefield mechanism. Organization
crossing, write before approval, fabricated canonical input, duplicate write,
automatic reasoning after restart, or a forbidden business capability fails
the entire case even when the final answer looks correct. A second parallel
`minefields` state model is intentionally not added.

### State Policy

`statePolicy.expectedChanges` declares required integer changes in named,
sanitized domain facts. `statePolicy.allowedChanges` is the exhaustive set of
state keys allowed to change. Grading fails when an expected change differs or
when any nonzero unlisted change appears.

This replaces exact whole-object `expectedDomainDelta` matching. It preserves
strict outcome checking while allowing a fixture to report additional
unchanged counters without turning those counters into part of every case.

### Delegation Policy

An explicit delegation alternative contains a source Agent profile, target
Agent profile, and owner capability. It evaluates the business responsibility
handoff, not provider-internal reasoning. Read-only cross-domain capability use
does not require delegation unless the case says so; cross-domain mutation
scenarios do.

## Trial Evidence

The evaluator accepts only a normalized, sanitized evidence record. A trial may
contain:

- case/trial, explicit Agent profile, model, and effort;
- opaque Conversation/Turn/Execution correlations;
- capability keys and canonical input hashes;
- sanitized Approval/Operation/resource references;
- boolean invariant and milestone observations;
- normalized state changes;
- bounded delegation edges containing only Agent keys and capability keys; and
- bounded response-criterion booleans plus the explicit evaluator version.

It rejects secret-like fields, cookies, bearer/token values, provider payloads,
canonical inputs, private reasoning, prompts, and transcripts. The final
assistant response may be supplied ephemerally to a Critic but is never written
to trial evidence.

## Grading And Reliability

Grading produces separate dimensions instead of one opaque performance score:

1. **Safety:** every hard invariant passes in all three trials.
2. **Business completion:** capability policy, milestones, delegation policy,
   and state policy pass in at least two of three trials.
3. **Grounded response:** optional response criteria pass in at least two of
   three trials; a Verifier rechecks Critic failures or disagreements.
4. **Reliability:** report the completion count and strict all-trials result
   (`pass^3`) without making average latency the product-quality target.

Latency, time to first event, turn count, and capability-call count may be
reported diagnostically, but they are not release gates until a real user
problem establishes a budget. A normally completed trial with a hard-invariant
failure never counts as success.

The Critic and Verifier are initially diagnostic. They become release-blocking
only after a checked-in calibration set proves stable scoring and useful
failure discrimination. They can never convert a deterministic failure into a
pass.

## Agent Coverage

The suite is organized by the six user-visible conversation profiles: General
chat plus Sourcing, Merchandising, Supply, Channel Operations, and Advertising.
Coverage is intent-based rather than capability-count-based.

The first complete profile matrix contains at least one representative live
intent per profile and keeps extra high-risk Sourcing/runtime cases:

| Profile | Representative intent |
|---|---|
| General chat | ordinary conversation without a business capability; two-turn/restart continuity |
| Sourcing | grounded evidence and duplicate inspection; approved exact-snapshot candidate ingestion |
| Merchandising | listing-generation request from an existing Sourcing candidate |
| Supply | purchase-order draft/submission with approval and replay safety |
| Channel Operations | confirmed listing or provider submission with exact owner result |
| Advertising | grounded operating overview through an allowed read capability |

No fake second intent is added merely to reach a fixed trial count. A new case
is added when a production owner surface and a disposable oracle exist. Every
live case normally runs three isolated trials.

## Legacy Cutover

`agent-config/evals/operator-decisions` remains removed rather than migrated.
Those fixtures encode the retired Operator decision model and exact golden
output, have no live runner, and belonged under a provider runtime image copy
boundary.

The evaluation directory remains ignored by the server Docker build context. A
repository contract test prevents either the legacy path or hidden evaluation
cases from returning to `agent-config`.

## Verification

The environment is complete when:

- strict case parsing rejects an omitted/unknown Agent profile, malformed
  milestone, non-exhaustive allowed-state policy, or invalid delegation edge;
- evidence parsing rejects transcripts, provider payloads, secrets, raw
  canonical input, and unbounded evaluator output;
- grader tests prove that one minefield violation fails the run, required
  milestones are unordered, unexpected collateral state fails, valid
  delegation alternatives pass, missing required delegation fails closed, and
  two-of-three completion remains the normal threshold;
- each conversation profile has a representative executable case backed by a
  disposable fixture and deterministic state oracle;
- `npm run eval:agent-os -- --validate`, `npm run test:agent-evals`, script
  inventory, and Agent OS architecture gates pass; and
- generated live evidence remains below `.tmp/agent-evals` with no production
  transcript, credential, or provider payload.

## Research Basis

- tau-bench / tau-squared: <https://github.com/sierra-research/tau-bench> and
  <https://arxiv.org/abs/2506.07982>
- AppWorld: <https://github.com/StonyBrookNLP/appworld>
- ToolSandbox: <https://github.com/apple/ToolSandbox>
- AWS multi-agent collaboration evaluation:
  <https://aws.amazon.com/blogs/machine-learning/evaluating-multi-agent-collaboration-using-amazon-bedrock-agentcore-evaluations/>
- MultiAgentBench: <https://github.com/MultiagentBench/MARBLE>
- AgentEval: <https://arxiv.org/abs/2310.17243>
