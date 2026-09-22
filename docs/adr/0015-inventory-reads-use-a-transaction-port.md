---
status: accepted
---

# Products reads use a transaction port

Products consumers need a stable capability without importing persistence implementation paths. Products exposes a transactional read input port and keeps its single canonical reader and lock implementation inside `adapter/out/persistence`, preserving the caller-owned transaction and validating organization-bound lock evidence. For this read-only seam the DI token binds directly to the persistence adapter instead of adding a forwarding UseCase and duplicate output port; business UseCases retain their input/output separation.

This supersedes only [ADR-0009](0009-one-ledger-one-reader.md)'s reader location and direct-import convention for Products source inventory. Its one-ledger/one-reader, organization scope and consumer-write prohibitions remain; other domains retain their existing reader convention. The manifest and negative boundary tests enforce both paths.

Products lists all current organization rows without per-row snapshot membership or elapsed-time gates. Purchase and Rocket calculations separately require an exact successfully published Sellpia collection attempt, with generation and transaction fences preserved.
