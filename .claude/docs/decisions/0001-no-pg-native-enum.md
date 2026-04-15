---
id: 0001
title: No PG native enum
status: Accepted
date: 2026-04-14
supersedes: []
superseded-by: null
affects:
  - prisma
  - apps/server
---

## Context

PostgreSQL 네이티브 enum 타입(`CREATE TYPE foo AS ENUM (...)`)을 스키마에 사용하면 enum 값이 바뀔 때 운영 시스템에서 **cast error** 가 발생한다. 프로덕션에서 실제로 겪은 사건:

- 기존 enum 에 신규 값 추가 → 마이그레이션은 통과하지만, 기존 코드가 해당 컬럼을 `WHERE status = 'new_value'` 로 쿼리할 때 DB 드라이버가 캐시된 enum 메타데이터를 사용해 **cast 실패**
- enum 값 이름 변경·삭제는 더 치명적. Prisma 가 enum 을 TypeScript 타입으로 가져오는 시점과 DB 상태가 어긋나면 런타임 에러
- enum 값 rename 을 위한 migration 이 복잡하고 downtime 유발

## Decision

**PostgreSQL 네이티브 enum 사용을 영구 금지한다.** 대신:

- Prisma schema 에 `String` 타입 컬럼 사용
- 허용 값 검증은 **애플리케이션 레이어**에서 담당:
  - NestJS DTO 는 class-validator `@IsIn([...])` (ADR-0002 참조)
  - 공유 타입은 `@kiditem/shared` 의 Zod enum (`z.enum([...])`)
  - 클라이언트 타입은 TypeScript `type Status = 'a' | 'b' | 'c'`
- 실제 DB 컬럼 레벨 제약이 필요하면 `CHECK` 제약 사용 — enum 타입보다 유연하고 마이그레이션 안전

## Consequences

**긍정**:
- enum 값 추가·변경·삭제가 앱 코드 변경만으로 완결. DB 마이그레이션 불필요.
- Prisma generate 와 DB 상태 불일치로 인한 런타임 cast error 제거.
- 값 집합이 서비스별로 약간 다를 수 있는 유연성 확보.

**부정**:
- DB 레벨 제약이 없어 직접 INSERT 시 임의 문자열 주입 가능 — 애플리케이션 경로를 우회하는 데이터 소스가 있으면 `CHECK` 제약 추가 필요.
- IDE·쿼리툴에서 "이 컬럼의 허용값이 뭐냐" 질문에 답을 얻으려면 앱 코드 참조 필요(스키마만 봐선 모름). comment 또는 `@kiditem/shared` 로 해결.

**뒤따르는 제약**:
- 모든 새 enum-like 컬럼은 `String`. 리뷰 시 native enum 도입 제안 reject.
- `prisma/CLAUDE.md` 에 이 규칙이 반영돼야 함 (이미 cross-domain rule 로 root CLAUDE.md 에 존재).

## Related

- [`.claude/docs/lessons.md`](../lessons.md) — "PG Enum Cast Error" 엔트리(축약된 포인터)
- Root `CLAUDE.md` Cross-Domain Rules — "No native PG enums"
- ADR-0002 — NestJS DTO 는 class-validator (검증 레이어 담당)
