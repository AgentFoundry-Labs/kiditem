---
status: accepted
---

# Errors are KidItem codes; status and operator text derive from one registry

Operator screens showed English NestJS messages, raw codes and stack text because every layer chose its own status, code spelling and wording. Every error a screen can see is now a code registered once in `@kiditem/shared/errors` together with its owner, kind, HTTP status and Korean operator sentence; server, web and extension derive status and wording from that registry and never send or render raw messages. We chose readable owner-prefixed codes over opaque numbers and over per-layer i18n so a code stays greppable and its sentence has one home.

## Consequences

Domain and adapter code throw `KiditemError` subclasses at the point of violation and controllers do not catch. The global filter maps framework exceptions (validation → `VALIDATION_FAILED` with `errors[]`, unknown route → `NOT_FOUND`, method → `METHOD_NOT_ALLOWED`, auth → `AUTH_REQUIRED`/`FORBIDDEN`, Prisma → `DB_CONFLICT`/`DB_NOT_FOUND`, anything else → `INTERNAL_ERROR`) and logs the original. The envelope is `{ statusCode, code, kind, message, errors, details? }` and carries no stack or raw text. The web reads only `code`, `kind` and `message`; the extension sends registry codes and renders from a generated copy; alerts store the derived sentence. `check:error-codes` rejects unregistered codes, growth of English exception literals and raw message rendering. `AppException`, `ErrorCodes` and `Fact*Error` are absorbed.

## Considered options

Passing server messages through and translating at the edge was rejected: 1,500 English literals and no single edge. Per-layer i18n keys were rejected: three catalogs to keep aligned. Opaque numeric codes as in the Spring guide were rejected: not self-describing and harder to search.
