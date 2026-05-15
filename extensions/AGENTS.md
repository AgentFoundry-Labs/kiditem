# extensions - Chrome Extensions

Browser extensions collect marketplace data and send it to KidItem NestJS APIs.
Read the extension-specific `AGENTS.md` before editing a concrete extension.

## Scope Map

| Path | Focus |
|---|---|
| [product-scraper/AGENTS.md](product-scraper/AGENTS.md) | Alibaba/1688 sourcing ingest |
| [coupang-ads-scraper/AGENTS.md](coupang-ads-scraper/AGENTS.md) | Coupang Wing and ad-center operations |

## Common Rules

- Extensions use Chrome Manifest V3. Do not add MV2 APIs or persistent background assumptions.
- Keep host permissions minimal and exact. Explain any new host in the scoped extension file.
- Do not commit tokens, cookies, account credentials, or copied marketplace session data.
- `chrome.storage.local` may store runtime tokens and progress state only.
- Treat popup, content script, page bridge, and external web messages as untrusted input.
- Validate message `type` / `action` values before triggering tabs, fetches, or marketplace actions.
- Page-world bridge scripts must never receive KidItem auth tokens or backend URLs with secrets.
- Content scripts parse DOM and user-visible page data; background/service workers own long-running tab orchestration.
- Backend calls go through NestJS HTTP APIs. Never add direct DB access or Supabase client logic here.
- Do not send client-provided `organizationId`; backend auth/session scope owns organization context.
- Keep staging/unpacked extension variants under `.secrets/` or runbooks, not committed source.
- If a setup flow changes, update the matching runbook under `docs/runbooks/`.

## Local Checks

```bash
node -e "JSON.parse(require('fs').readFileSync('extensions/product-scraper/manifest.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('extensions/coupang-ads-scraper/manifest.json','utf8'))"
git diff --check -- extensions
```
