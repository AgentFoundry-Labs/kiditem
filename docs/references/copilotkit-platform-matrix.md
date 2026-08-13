# CopilotKit Platform Matrix

Evidence was captured on 2026-08-13 (Asia/Seoul). The machine-readable source
of truth is
[`deploy/interaction-intelligence/platform-lock.json`](../../deploy/interaction-intelligence/platform-lock.json).

## Supported train

| Surface | Lock | Evidence and current conclusion |
|---|---:|---|
| CopilotKit Runtime and React v2 | `1.67.1` | The public npm registry returns Runtime and React Core `1.67.1`; React Core publishes the `./v2`, `./v2/context`, and `./v2/headless` exports. Runtime declares `@ag-ui/client`, `@ag-ui/core`, and `@ag-ui/encoder` at exactly `0.0.57`. Both CopilotKit packages report MIT licensing. |
| AG-UI client and core | `0.0.57` | The public npm registry returns both packages at `0.0.57`, with public tarball URLs. |
| Enterprise Intelligence chart | `0.10.23` | An anonymous GHCR manifest request returned HTTP 200 for `oci://ghcr.io/copilotkit/charts/intelligence:0.10.23`. Its OCI metadata reports chart and app version `0.10.23`, digest `sha256:6de89e2dfbe766d39c598a8851dd16ad6b284cd33390d06bf177e6bb7ff9ef95`. This proves public registry metadata only; no proprietary self-host artifact was obtained and no deployment acceptance was performed. |
| Runtime prerequisites | Node `>=22 <23`; Kubernetes `>=1.28`; Helm `>=3.12`; PostgreSQL `>=14`; Redis `>=7` | The Node range matches KidItem's root engine contract. CopilotKit's public [self-hosting guide](https://github.com/AgentFoundry-Labs/CopilotKit/blob/7fd4c5ee782a9fd4fe7e662c304920bd453d2490/showcase/shell-docs/src/content/snippets/shared/premium/self-hosting.mdx) states the remaining minimums and identifies PostgreSQL and Redis as platform dependencies. |
| Source lineage | fork `AgentFoundry-Labs/CopilotKit`; upstream `CopilotKit/CopilotKit` | GitHub reports the fork as public, MIT, and a direct fork of canonical upstream. At capture it was at `7fd4c5ee782a9fd4fe7e662c304920bd453d2490`: ahead `0`, behind `2`, status `behind`. It mirrors canonical lineage but was not byte-for-byte current at the observation time. |

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

GitHub repository metadata additionally returned `visibility=public`,
`fork=true`, `license=MIT`, and `parent/source=CopilotKit/CopilotKit`. The
canonical upstream is also public and MIT. Public source at the captured fork
commit demonstrates the client contracts needed by this program:

- Reconnect: [`CopilotChat.tsx`](https://github.com/AgentFoundry-Labs/CopilotKit/blob/7fd4c5ee782a9fd4fe7e662c304920bd453d2490/packages/react-core/src/v2/components/chat/CopilotChat.tsx) subscribes to Intelligence run activity and reconnects the matching idle chat, with guards against local, duplicate, wrong-thread, and wrong-agent activity.
- Human in the loop: [`use-human-in-the-loop.tsx`](https://github.com/AgentFoundry-Labs/CopilotKit/blob/7fd4c5ee782a9fd4fe7e662c304920bd453d2490/packages/react-core/src/v2/hooks/use-human-in-the-loop.tsx) publicly exports `useHumanInTheLoop` and supplies `respond` while a tool call is executing.
- Archive and thread history: the public [`CopilotKitIntelligence` client](https://github.com/AgentFoundry-Labs/CopilotKit/blob/7fd4c5ee782a9fd4fe7e662c304920bd453d2490/packages/runtime/src/v2/runtime/intelligence-platform/client.ts) exposes `listThreads({ includeArchived })`, `getThreadMessages`, and `archiveThread`.

## Access decision and production stop condition

Implementation plus unit and contract verification may proceed without a paid
Team or Enterprise purchase and without a vendor support case. The public npm
packages, AG-UI packages, source APIs, and chart registry metadata are
available now. CopilotKit's public
[cloud-hosted guide](https://github.com/AgentFoundry-Labs/CopilotKit/blob/7fd4c5ee782a9fd4fe7e662c304920bd453d2490/showcase/shell-docs/src/content/docs/premium/managed-intelligence-platform.mdx)
also identifies **Developer** as the no-cost hosted choice. This phase did not
buy, provision, or mutate any external service.

Production self-hosted acceptance and provisioning remain a later Plan 4
deployment gate. That gate must validate the released chart, license,
registry access, target-cluster topology, identity, storage, and operations in
the intended production environment. Self-hosting is currently documented as
requiring a Team self-hosted or custom Enterprise plan. If that later gate
requires a contract or cost, obtain explicit owner approval before purchase or
provisioning. Stop the production deployment if the artifact, license, or
acceptance criteria cannot be verified; public source and manifest metadata
are not substitutes for production acceptance.

The workspace guard is intentionally a precursor gate in Foundation Task 1.
KidItem's existing manifests still declare the legacy `1.66.2`/`0.0.53` train
and `@copilotkit/react-ui`; dependency normalization belongs to Foundation Task
5. Until that migration lands, direct `npm run check:copilotkit-train` failure
is expected and honest.
