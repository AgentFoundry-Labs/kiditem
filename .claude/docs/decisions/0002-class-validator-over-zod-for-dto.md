---
id: 0002
title: NestJS DTO 는 class-validator
status: Accepted
date: 2026-04-14
supersedes: []
superseded-by: null
affects:
  - apps/server
---

## Context

초기 구현에서 NestJS 백엔드의 요청 DTO 검증을 **Zod 기반**으로 시작했다. 82개 파일에 Zod 스키마와 ZodValidationPipe 를 도입한 뒤, 오픈소스 레퍼런스 조사(Cal.com, Novu, Twenty 등)에서 **NestJS 생태계 표준은 class-validator + class-transformer** 임을 확인. 전체 82개 파일을 class-validator 로 재작성.

촉발 요인:
- NestJS 공식 문서·가이드·대부분의 성숙한 OSS 프로젝트가 class-validator 를 사용 — 생태계 도구·예제·플러그인과의 호환성
- Swagger/OpenAPI 자동 문서 생성 데코레이터(`@ApiProperty`)가 class-validator 와 같은 클래스 기반 모델을 전제
- class-validator 는 NestJS 의 `ValidationPipe` 와 기본 통합 — 별도 pipe 작성 불필요

## Decision

**NestJS 백엔드의 요청/응답 DTO 는 class-validator + class-transformer** 를 사용한다.

- DTO 파일 위치: `apps/server/src/<domain>/dto/*.dto.ts`
- 데코레이터 패턴: `@IsString()`, `@IsEnum(...)`, `@IsUUID()`, `@IsIn([...])`, `@IsOptional()`, `@ValidateNested()`, `@Type(() => Child)` 등
- 전역 `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })` 유지
- Swagger 통합 시 `@ApiProperty()` 병행

**예외·구분**:
- `packages/shared/` 의 **Zod 유지** — 프론트-백엔드 공유 타입 스키마(응답 파싱, 런타임 타입 guard) 목적. class-validator 는 NestJS DTO 전용, Zod 는 cross-runtime 공유 스키마 전용. 역할 분리.
- Python 에이전트 쪽 검증은 pydantic (별개 스택)

## Consequences

**긍정**:
- NestJS 생태계 관용과 일치 — 신규 멤버·AI 에이전트가 코드 즉시 이해.
- Swagger·OpenAPI 자동 문서화·타입 생성 경로가 깔끔.
- 데코레이터 기반이라 클래스 프로퍼티 위에서 검증 규칙이 바로 읽힘.

**부정**:
- `packages/shared` (Zod) 와 DTO (class-validator) 가 **같은 shape 을 두 번 정의** — drift 가능성. 방어책:
  - 응답 파싱 시 프론트에서 `SharedSchema.safeParse(response)` 를 테스트에서 강제 → shape 불일치 즉시 fail
  - DTO 변경 시 shared 스키마 동기화를 PR 체크리스트에 포함
- 클래스 기반이라 플레인 객체 복사·직렬화 시 `class-transformer` `plainToInstance` 필요. 미적용 시 데코레이터 무효.

**뒤따르는 제약**:
- 새 엔드포인트의 요청 바디·쿼리·파라미터 DTO 는 class-validator. PR 리뷰에서 Zod 로 작성한 DTO 는 reject.
- 기존 `packages/shared` 의 Zod 스키마를 DTO 로 직접 사용하지 않는다(도구 체인 혼란).

## Related

- [`.claude/docs/lessons.md`](../lessons.md) — "Zod DTO False Start" 엔트리(축약된 포인터)
- ADR-0001 — No PG native enum (enum-like 검증은 `@IsIn` 으로 이 ADR 의 경로를 따라감)
- `packages/shared/CLAUDE.md` — Zod 사용 규칙(공유 스키마 한정)
