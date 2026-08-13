# CopilotKit OSS Platform Matrix

Evidence was captured on 2026-08-13 (Asia/Seoul). Foundation Task 1 replaces
the obsolete Enterprise-oriented lock with the machine-readable source of
truth at `deploy/interaction-gateway/platform-lock.json`.

## Supported train

| Surface | Lock | Evidence and current conclusion |
|---|---:|---|
| CopilotKit OSS Runtime and React v2 | `1.67.1` | The public npm registry returns Runtime and React Core `1.67.1`; React Core publishes `./v2`, `./v2/context`, and `./v2/headless`. Runtime declares `@ag-ui/client`, `@ag-ui/core`, and `@ag-ui/encoder` at exactly `0.0.57`. No Enterprise endpoint or project credential is part of the selected path. |
| AG-UI client, core, and encoder | `0.0.57` | The public npm registry returns the three public packages and tarballs. `@ag-ui/client` supplies `HttpAgent`, event streaming, state tracking, subscribers, and middleware for a KidItem-owned AG-UI endpoint. |
| Runtime prerequisites | Node `>=22 <23`; PostgreSQL as the repository train | Node matches KidItem's root engine contract. Conversation durability, replay, retention, and locking use KidItem's Prisma/PostgreSQL and Operations contracts rather than a CopilotKit platform datastore. |
| Source lineage | fork `AgentFoundry-Labs/CopilotKit`; upstream `CopilotKit/CopilotKit` | GitHub reports the fork as public and a direct fork of canonical upstream. At capture it was at `7fd4c5ee782a9fd4fe7e662c304920bd453d2490`: ahead `0`, behind `2`, status `behind`. The fork is research and bounded patch-review lineage, never a floating runtime dependency. |
| Excluded product layer | no version | CopilotKit's official [OSS vs Enterprise](https://docs.copilotkit.ai/a2a/concepts/oss-vs-enterprise) documentation distinguishes the OSS frontend/runtime stack from Enterprise Intelligence, which adds durable threads, persistence, realtime sync, observability, and the hosted/admin plane. KID-25 implements those production responsibilities in KidItem and does not configure Rich Threads, hosted projects, Premium APIs, or the Enterprise chart. |

## Reproducible proof

The required registry and comparison probes produced these concise results:

```text
gh api repos/AgentFoundry-Labs/CopilotKit/compare/CopilotKit:main...main
  status=behind ahead_by=0 behind_by=2
  merge_base=7fd4c5ee782a9fd4fe7e662c304920bd453d2490

npm view @copilotkit/runtime@1.67.1 dependencies --json
  @copilotkit/shared=1.67.1
  @ag-ui/client=0.0.57 @ag-ui/core=0.0.57 @ag-ui/encoder=0.0.57

npm view @copilotkit/react-core@1.67.1 version --json
  1.67.1

npm view @ag-ui/client@0.0.57 version --json
  0.0.57
```

Public source at the captured fork commit demonstrates the interaction
contracts needed by this program:

- React chat primitives:
  [`CopilotChat.tsx`](https://github.com/AgentFoundry-Labs/CopilotKit/blob/7fd4c5ee782a9fd4fe7e662c304920bd453d2490/packages/react-core/src/v2/components/chat/CopilotChat.tsx)
  provides the v2 conversation surface.
- Human in the loop:
  [`use-human-in-the-loop.tsx`](https://github.com/AgentFoundry-Labs/CopilotKit/blob/7fd4c5ee782a9fd4fe7e662c304920bd453d2490/packages/react-core/src/v2/hooks/use-human-in-the-loop.tsx)
  exports `useHumanInTheLoop` and supplies `respond` while a tool call is
  executing.
- AG-UI transport: the public `@ag-ui/client` package exposes `HttpAgent` and
  streamed event/state subscribers, allowing the KidItem gateway to remain the
  durable backend.

## License evidence and stop gate

Current official sources are inconsistent about the OSS license label: the
[CopilotKit repository](https://github.com/CopilotKit/CopilotKit) and exact npm
package metadata report MIT, while the public OSS-versus-Enterprise page
describes the OSS layer as Apache 2.0. This matrix does not guess which
statement controls a particular artifact. Foundation Task 1 snapshots the
exact tarball license files and package metadata; an unresolved mismatch stops
dependency acceptance.

This discrepancy does not change the architecture boundary: only public OSS
packages are selected, and no Premium or Enterprise service is an allowed
fallback.

## KidItem production acceptance

The OSS package proof is necessary but not sufficient. Production acceptance
must also prove:

- first-send atomicity across session control and the first conversation event;
- append-before-publish ordering and duplicate-event rejection;
- PostgreSQL snapshot/cursor replay followed by an atomic live-stream join;
- browser, gateway, API, and worker restart recovery;
- organization/user fencing for list, history, reconnect, archive, restore,
  retention, legal hold, and deletion;
- HITL resume without duplicate capability execution; and
- exact-package upgrade canaries against retained KidItem event fixtures.

The current workspace manifests still declare the legacy
`1.66.2`/`0.0.53` train and `@copilotkit/react-ui`; dependency normalization
belongs to the implementation plans. Until that migration lands, direct
`npm run check:copilotkit-train` failure is expected and honest.
