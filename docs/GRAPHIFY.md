# Graphify Knowledge Graph

Graphify is for codebase/ontology navigation, not for DB schema truth.

- **DB truth:** `prisma/models/*.prisma`.
- **ERD view:** `docs/ERD.md` plus domain diagrams under `docs/erd/`, regenerated with `npm run db:erd`.
- **Schema ontology view:** `graphify-out/schema/GRAPH_REPORT.md`, `graphify-out/schema/graph.html`, and `graphify-out/schema/graph.json`.
- **Schema consumer view:** `graphify-out/schema-consumers/GRAPH_REPORT.md`, `graphify-out/schema-consumers/graph.html`, and `graphify-out/schema-consumers/graph.json`.

## Recommended scope

For current schema refactor work, use the curated deterministic generator:

```bash
npm run graphify:schema
```

It writes two graphs:

- `graphify-out/schema/` — Prisma models + `docs/ERD.md` + schema guidance.
- `graphify-out/schema-consumers/` — schema graph + `apps/server/src/channels` + `packages/shared` + `scripts`.

Use these before a full repository graph because Graphify v0.5 does not directly classify `.prisma` model files as code input. The generator parses Prisma models directly, then uses Graphify's AST extractor/exporter for TypeScript/JavaScript/Python/shell consumers.

For a broad architecture baseline later, use the installed assistant skill rather than the CLI:

```text
$graphify .
```

That full graph is useful for repo onboarding and cross-domain architecture questions, but it is noisier and more expensive than the curated schema graphs.

## Install

Requires Python 3.10+. Official package name is `graphifyy`; the CLI command is `graphify`.

```bash
uv tool install graphifyy
graphify codex install
```

For Codex, invoke the skill as:

```text
$graphify .
```

The Codex install also writes `.codex/hooks.json` so the assistant sees a PreToolUse reminder when the curated graph exists. The CLI is useful after a graph exists:

```bash
graphify query "externalOptionId ChannelSyncService" --graph graphify-out/schema-consumers/graph.json
graphify path "ChannelListingOption externalOptionId" "channel-sync.service.ts" --graph graphify-out/schema-consumers/graph.json
graphify explain "ChannelListingOption" --graph graphify-out/schema/graph.json
```

## Ignore policy

`.graphifyignore` keeps generated, vendored, binary, and session-local files out of the graph. It intentionally excludes heavy reference assets under `docs/references/`; remove that pattern temporarily if a specific PDF/XLSX should be part of a graph run.

## Commit policy

Commit these when the graph is intentionally refreshed for the team:

- `docs/ERD.md`
- `docs/erd/*.md`
- `graphify-out/schema/GRAPH_REPORT.md`
- `graphify-out/schema/graph.html`
- `graphify-out/schema/graph.json`
- `graphify-out/schema-consumers/GRAPH_REPORT.md`
- `graphify-out/schema-consumers/graph.html`
- `graphify-out/schema-consumers/graph.json`
- each output directory's `README.md`

Do not commit local/transient graphify files such as cache, manifest, or token cost files.

## How to use with ERD

Use both views together:

1. Open `docs/ERD.md` for exact FK/table structure.
2. Open `docs/erd/{domain}.md` for readable domain-scoped ERD diagrams.
3. Open `graphify-out/schema/graph.html` for schema/domain ontology.
4. Open `graphify-out/schema-consumers/graph.html` for schema-to-code consumer links.
5. Treat Graphify `INFERRED` or `AMBIGUOUS` relationships as review hints, not facts.
