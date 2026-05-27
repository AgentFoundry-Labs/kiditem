---
name: magic-scraper
description: Use when developing, repairing, or hardening browser-based data extractors from real page evidence for authorized websites or app screens.
---

# Magic Scraper

Internal developer workflow for turning real browser observations into durable KidItem data extraction code. This skill is host-agnostic: use it to author or repair extractors for authorized websites, logged-in browser pages, admin screens, product pages, search results, tables, dashboards, or app views. Production Agent OS and MCP tools should execute approved, tested code produced by this workflow, not this skill itself.

## Boundaries

- Treat this as a development skill, not a production runtime.
- Use local Chrome CDP to observe pages the developer is authorized to access.
- Do not expose arbitrary browser JS, shell, filesystem, raw HTTP, or raw DB access as Agent OS/MCP tools.
- Do not ingest scraped data into canonical KidItem rows unless the user explicitly asks and the normal sourcing ports/sinks are used.
- Keep throwaway observations under `/tmp`; commit only redacted fixtures, extractor code, tests, and durable docs.
- For production exposure, add or reuse narrow owner-domain capabilities and approved sink/workflow capabilities.

## Workflow

1. Read the scoped guides before production edits:
   - `AGENTS.md`
   - the target domain's nearest `AGENTS.md`
   - `apps/server/src/agent-os/AGENTS.md` if Agent OS/MCP exposure is discussed
   - `apps/server/src/automation/AGENTS.md` if deterministic workflow exposure is discussed

2. Define the target page family and output contract:
   - page examples and host patterns
   - page type such as collection, detail, search, table, dashboard, queue, report, or form-like read view
   - expected fields and output schema
   - whether the result is dev-only JSON, scraper code, capability wiring, or MCP exposure

3. Observe the page with local Chrome CDP:
   - Reuse the KidItem managed CDP browser when available at `http://127.0.0.1:9222`.
   - Run `scripts/probe-cdp-page.mjs <url> --out /tmp/<name>.json` from the repo root.
   - Prefer model/data paths (`window.context`, `__INIT_DATA__`, JSON script tags, network payloads) over translated visible text.
   - Use DOM selectors only after checking that no stable model data exists.

4. Build the deterministic extractor:
   - Keep extraction logic independent from Codex reasoning.
   - Normalize output to the domain snapshot shape before wiring it to ports or MCP tools.
   - Keep browser orchestration separate from page-specific extraction.
   - Add a fixture from observed output and a regression test that fails when key fields disappear.

5. Promote only after verification:
   - focused scraper test
   - relevant sourcing tests
   - `npm run build --workspace=apps/server` for production TypeScript changes
   - `npm run dev:server` if NestJS module/service wiring changes

## Optional Site References

Do not assume the target is 1688. First inspect the current page and identify its own stable data sources.

For 1688 detail pages only, read `references/1688-model-map.md` when mapping fields. The stable source is usually:

```text
window.context.result.global.globalData.model
```

Collection pages such as `show.1688.com` often expose only links/cards in DOM, then each `detail.1688.com/offer/<id>.html` page exposes the richer internal model.

## Expected Outputs

For a new extractor capability, prefer this bundle:

- extractor implementation
- one or more redacted fixtures
- focused unit tests
- capability manifest/port updates only when the extractor becomes a platform-facing capability
- MCP tool wrapper only after the domain capability is narrow and approved

For a dev-only investigation, return the `/tmp` JSON path and a short field coverage summary instead of committing scraped data.

## Common Mistakes

| Mistake | Correction |
|---|---|
| Treating a successful Codex browser scrape as production behavior | Convert the observed path into deterministic code and tests. |
| Scraping visible translated text first | Inspect embedded page models and structured payloads first. |
| Exposing arbitrary recipe execution to Agent OS/MCP | Expose narrow approved capabilities that call reviewed code. |
| Committing raw scraped dumps with sensitive/session data | Redact and shrink fixtures to the contract under test. |
| Writing canonical DB rows directly from browser code | Route writes through owner-domain sinks/ports after approval. |
