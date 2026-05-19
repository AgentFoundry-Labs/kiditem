# extensions — Chrome Extensions

`extensions/` owns Chrome Manifest V3 browser extensions that collect
marketplace data and send it to KidItem NestJS APIs. Read the
extension-specific guide before editing a concrete extension.

## Folder Map

```text
extensions/
├── product-scraper/          # Alibaba/1688 sourcing ingest
└── coupang-ads-scraper/      # Coupang Wing and ad-center operations
```

## Scoped Guides

| Path | Focus |
|---|---|
| [`product-scraper/AGENTS.md`](product-scraper/AGENTS.md) | Alibaba/1688 sourcing ingest |
| [`coupang-ads-scraper/AGENTS.md`](coupang-ads-scraper/AGENTS.md) | Coupang Wing and ad-center operations |

## Common Rules

- Use Chrome Manifest V3. Do not add MV2 APIs or persistent background
  assumptions.
- Keep host permissions minimal and exact. Explain new hosts in the scoped
  extension guide.
- Do not commit tokens, cookies, account credentials, or copied marketplace
  session data.
- `chrome.storage.local` may store runtime tokens and progress state only.
- Treat popup, content script, page bridge, and external web messages as
  untrusted input.
- Validate message `type` / `action` values before triggering tabs, fetches, or
  marketplace actions.
- Page-world bridge scripts must never receive KidItem auth tokens or backend
  URLs with secrets.
- Backend calls go through NestJS HTTP APIs. Never add direct DB access or
  Supabase client logic.
- Do not send client-provided `organizationId`; backend auth/session scope owns
  organization context.
- Staging/unpacked variants belong under `.secrets/` or runbooks, not committed
  source.

## Verification

```bash
node -e "JSON.parse(require('fs').readFileSync('extensions/product-scraper/manifest.json','utf8'))"
node -e "JSON.parse(require('fs').readFileSync('extensions/coupang-ads-scraper/manifest.json','utf8'))"
git diff --check -- extensions
```
