# Upstream provenance

This package is a narrow workspace fork of
`@copilotkit/sqlite-runner@1.69.0` from the CopilotKit repository:
https://github.com/CopilotKit/CopilotKit

Source tarball:
`https://registry.npmjs.org/@copilotkit/sqlite-runner/-/sqlite-runner-1.69.0.tgz`

SHA-256:
`81c1abbdca19d138912ee2644f2aeacc6bc51c6908c2dea22ba64ebdcf254579`

The upstream MIT license is retained in [LICENSE](./LICENSE).

## KidItem delta

Only the lifecycle/storage seams characterized as incompatible with KidItem's
execution-authority contract are changed:

1. active-run serialization is process-local rather than a durable SQLite
   `run_state` authority, so API reconstruction cannot retain or resume a run;
2. `stop` honors an optional exact `runId` and keeps an active run present until
   the agent emits/finishes its terminal event; and
3. `deleteThread` transactionally removes one exact completed event chain.

All upstream AG-UI event compaction, replay, active connection bridging, and
run-input behavior remain in this package. Nest owns authenticated business
authority and maps organization-scoped public conversation IDs to its internal
thread keys before calling this runner.
