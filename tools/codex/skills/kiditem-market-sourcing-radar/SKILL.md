---
name: kiditem-market-sourcing-radar
description: Analyze KidItem stationery and toy sourcing trends from persisted Naver, Coupang, 1688, Shorts, Google Trends, and pilot LinkFox evidence. Use when asked for market sourcing research, rising-product discovery, candidate comparison, test-order decisions, trend freshness or data-gap audits, or the 30-day shadow/A-B evaluation. Produce evidence-led test_order, hold, or reject recommendations without fabricating missing metrics or letting shadow signals affect decisions.
---

# KidItem Market Sourcing Radar

Analyze the latest organization-scoped evidence already stored by KidItem. Keep demand, supply, risk, and experimental shadow evidence visibly separate.

## Workflow

1. Read the repository root `AGENTS.md`. Read [references/evidence-contract.md](references/evidence-contract.md) before selecting routes or capabilities.
2. Confirm the organization and requested keyword/category. Never accept an `organizationId` from a client payload when operating server code; use the authenticated organization boundary.
3. Inspect freshness before collecting anything. Default to the latest 30 KST business days of persisted evidence.
4. Replay the canonical discovery capabilities or read the source snapshots. Do not substitute hardcoded examples, remembered market facts, or synthetic metrics.
5. Normalize an evidence ledger with source, platform, business date/capture time, entity id or URL, metric, and whether the value is raw or model-derived.
6. Require at least three supporting signals across at least two platforms for a positive candidate. Treat duplicated rows or multiple metrics from one snapshot as one evidence family.
7. Keep demand evidence separate from supply evidence:
   - Demand: Naver search/popular ranks, Coupang reaction/tracking, Shorts velocity.
   - Supply: 1688 availability, supplier quality, price, margin, MOQ, and fulfillment evidence.
8. Review KC/safety, IP/character licensing, seasonality, MOQ, landed cost, and margin. Mark unavailable checks as unknown; never silently clear them.
9. Return exactly one decision per candidate:
   - `test_order`: persisted Coupang×1688 cross-evidence exists, the model says order/recommend, confidence is at least 0.67, and no blocking risk or unknown unit economics remains.
   - `hold`: evidence is promising but incomplete, the model says observe/watch, confidence is below 0.67, or a required risk/cost check is unknown.
   - `reject`: the model excludes the candidate, unit economics are negative, or a safety/IP risk is blocking.
10. Put Google Trends and LinkFox results in a separate **Shadow appendix**. Preserve `decisionImpact=disabled`; never add shadow metrics to scores, rankings, or final decisions.

## Collection Guardrails

- Prefer read/replay operations. Collect fresh sources only when the user explicitly asks for fresh collection or the evidence window is stale and collection is already authorized.
- Treat `market.collect_keyword_category_rankings` as persisted replay despite its legacy name.
- Ask for approval before `market.collect_shadow_signals`; it performs external I/O and a database write.
- Never bypass the LinkFox controls. A paid call requires `SOURCING_LINKFOX_SHADOW_ENABLED=1`, an allowlisted organization, a supported explicit region, and `LINKFOX_AGENT_API_KEY`.
- Never retry a failed LinkFox collection for the same KST business date. The daily claim is the cost ceiling.
- Never expose provider keys, authorization headers, response bodies containing secrets, or credentials in analysis output.
- Do not choose an AI model or provider fallback when model selection is missing; surface the configuration error.

## Output Contract

Lead with a compact candidate table containing candidate, decision, canonical model score/decision, confidence, demand evidence, supply evidence, and blocking risks.

Then include:

1. **Evidence ledger** — cite snapshot ids, offer/product/video ids, source URLs, and capture/business dates.
2. **Data gaps** — copy canonical `dataGaps` and add explicit risk/unit-economics unknowns.
3. **Decision rationale** — distinguish raw evidence from model-derived components; do not recompute or rename the canonical model score.
4. **Shadow appendix** — report observation days, Google relevance, LinkFox overlap/novel/fresh counts, evidence completeness, and cost points. State that it had zero decision impact.
5. **Next action** — name the smallest safe action: refresh a missing source, inspect a supplier, verify KC/IP, observe for three days, or draft a test order after user selection.

If no real evidence exists, return no candidates and explain the missing sources. Never create a plausible-looking recommendation.
