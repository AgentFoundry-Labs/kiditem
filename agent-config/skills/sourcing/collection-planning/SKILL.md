---
name: sourcing.collection-planning
description: Refresh sourcing data through bounded deterministic Operations.
---

# Collection planning

1. Inspect current evidence and the recommendation run first.
2. Call `sourcing_refresh_collection` once with explicit sources when data is missing or stale.
3. Reuse the returned `operationRunId` and stop; never poll within the AgentRun.
4. Report extension, login, CAPTCHA, or source-readiness gaps exactly as returned.
5. Never recreate provider collection steps inside the model.
