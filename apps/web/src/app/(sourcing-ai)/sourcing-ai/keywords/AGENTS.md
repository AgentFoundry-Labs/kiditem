Consult this document first instead of relying on memorized knowledge.

# web/sourcing-ai/keywords - Keyword Collection and Analysis

`keywords/` owns sourcing keyword analysis UI, trend keyword agent helpers, and
extension-backed Coupang keyword collection.

## State Rules

- Keep extension and trend-agent helpers in route-local `lib/`.
- Browser storage may cache operator workflow state but not durable keyword
  source-of-truth records.
- Keep analysis helpers pure when transforming keyword rows.

## Boundary Rules

- Do not call marketplace pages directly from UI code; use extension helpers.
- Do not promote candidates or mutate catalog records here.
- Missing model/config selection must be surfaced explicitly.
