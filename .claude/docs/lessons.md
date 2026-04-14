# Lessons Learned

Team-shared patterns from past incidents. Review at session start.

이 문서는 **결정으로 이어지지 않은 프로세스 교훈** 만 담는다. 아키텍처 결정(경계·정책·폐기 선언)은 [`decisions/`](decisions/README.md) 의 ADR 이 정본.

## DI Wiring (2024-04)

**Incident**: BusinessSafetyModule missed WakeupService in providers. tsc passed, 116 tests passed, but server crashed on boot with UnknownDependenciesException.
**Lesson**: tsc + vitest don't catch NestJS DI errors. Always run `npm run dev:server` after module changes.

## Zod DTO False Start (2024-03)

→ [ADR-0002: NestJS DTO 는 class-validator](decisions/0002-class-validator-over-zod-for-dto.md)

## PG Enum Cast Error (Production)

→ [ADR-0001: No PG native enum](decisions/0001-no-pg-native-enum.md)

## Follow-up Debt

**Incident**: "Phase 2" and "TODO: apply later" items accumulated and were never addressed, creating hidden technical debt.
**Lesson**: Apply changes to ALL files in scope during the current session. Never defer to follow-up issues.

## Python Agent Circular Import

→ [ADR-0003: Python agents communicate via DB](decisions/0003-python-agents-communicate-via-db.md)
