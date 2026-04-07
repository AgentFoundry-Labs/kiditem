# Lessons Learned

Team-shared patterns from past incidents. Review at session start.

## DI Wiring (2024-04)

**Incident**: BusinessSafetyModule missed WakeupService in providers. tsc passed, 116 tests passed, but server crashed on boot with UnknownDependenciesException.
**Lesson**: tsc + vitest don't catch NestJS DI errors. Always run `npm run dev:server` after module changes.

## Zod DTO False Start (2024-03)

**Incident**: Built 82 files with Zod-based DTO validation. Reference research afterward revealed NestJS standard is class-validator. Entire batch rewritten.
**Lesson**: Always research how major OSS projects (Cal.com, Novu, Twenty) solve a pattern before implementing. This applies to any new convention or library choice.

## PG Enum Cast Error (Production)

**Incident**: Native PostgreSQL enum caused production cast errors when enum values were modified.
**Lesson**: Use `String` fields + app-level validation instead of native PG enums. Decision is permanent.

## Follow-up Debt

**Incident**: "Phase 2" and "TODO: apply later" items accumulated and were never addressed, creating hidden technical debt.
**Lesson**: Apply changes to ALL files in scope during the current session. Never defer to follow-up issues.

## Python Agent Circular Import

**Incident**: Direct imports between Python agents caused circular dependency and import order sensitivity.
**Lesson**: Agents communicate via DB state only. No direct imports between agent modules.
