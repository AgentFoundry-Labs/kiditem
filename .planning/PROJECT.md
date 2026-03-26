# KidItem

## What This Is

키드아이템 이커머스 운영 자동화 플랫폼. 중국(1688/타오바오) 소싱 상품을 AI로 가공하여 한국 마켓플레이스에 리스팅하는 셀러 운영 도구. Next.js 프론트엔드 + NestJS 백엔드 + Python AI 에이전트 구조.

## Core Value

소싱 상품을 최소한의 수작업으로 판매 가능한 상세페이지로 변환하고, 운영 전반을 하나의 대시보드에서 관리한다.

## Completed Milestone: v2.1 WYSIWYG 상세페이지 에디터 ✓

**Goal:** 수집 직후 GrapesJS에서 상세페이지를 직접 편집하고, 개별 요소를 AI로 가공할 수 있다.

**Delivered (2026-03-27):**
- ✓ 수집 직후(draft) 에디터 진입 — AI 가공 없이 GrapesJS에서 바로 편집
- ✓ 플레이스홀더 bold-vertical HTML을 GrapesJS에 로드
- ✓ "AI로 나머지 채우기" CTA — 빈 필드 한번에 AI 자동 생성
- ✓ 개별 텍스트 AI 편집 — 다시쓰기/번역/축약/자유 프롬프트 (Gemini)
- ✓ 개별 이미지 AI 편집 — 배경 제거/AI 생성 (FAL.AI)
- ✓ 오른쪽 패널 AI 전용 자동 전환 (텍스트↔이미지↔디자인 채팅)
- ✓ isBusy 가드 — 모든 AI 표면에서 동시 실행 방지
- ✓ OneShot 제거 + 코드 정리

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- Product data ingestion via Chrome extension (1688/Alibaba)
- AI content generation (Korean copywriting from Chinese product data)
- AI image editing (background replacement, text removal via FAL.AI)
- Template-based detail page rendering (bold-vertical, simple-vertical)
- Workflow engine with AI analysis
- Product sourcing pipeline with status tracking
- DB schema supports intermediate pipeline state (draftContent + pipelineStep) — v1.0
- Two-step pipeline: content_draft → content_image (FAL.AI) — v1.0
- NestJS API: draft-content, preview, trigger-image-gen — v1.0
- Frontend editor with structured editing + pipeline CTA — v1.0
- ✓ 쿠팡 주문 대시보드 (KPI, 트렌드 차트, 상품 랭킹, 상세) — v2.0
- ✓ 반품/교환 대시보드 (사유 분석, 과실 비율) — v2.0
- ✓ KST 타임존 정확한 날짜 처리 — v2.0
- ✓ DateRangePicker 공유 컴포넌트 — v2.0
- ✓ 수집 직후(draft) GrapesJS 에디터 진입 — v2.1
- ✓ 플레이스홀더 bold-vertical HTML 로드 — v2.1
- ✓ 개별 텍스트 AI 편집 (다시쓰기/번역/축약/자유 프롬프트) — v2.1
- ✓ 개별 이미지 AI 편집 (배경 제거/AI 생성) — v2.1
- ✓ "AI로 나머지 채우기" 빈 필드 자동 생성 — v2.1
- ✓ 오른쪽 패널 AI 자동 전환 — v2.1
- ✓ OneShot 파이프라인 코드 제거 — v2.1

### Active

<!-- Current scope. Building toward these. -->

None — v2.1 milestone complete.

### Out of Scope

- 쿠팡 API 실시간 연동 — API 키 미확보, DB 기반 조회만
- 새 템플릿 추가 — 기존 템플릿 활용
- 모바일 앱 — 웹 우선
- 다채널 (스마트스토어, 11번가 등) — 쿠팡 우선

## Context

- GrapesJS + `@grapesjs/react` — WYSIWYG 에디터 (v2.1 완료)
- 오른쪽 패널: AI 전용 자동 전환 (텍스트 AI ↔ 이미지 AI ↔ 디자인 채팅)
- NestJS `POST /api/text-ai/transform` — Gemini 기반 텍스트 변환 (다시쓰기/번역/축약/자유)
- AIImageEditPanel — 배경 제거, 텍스트 제거, 배경 교체, 화질 개선, 이미지 재생성
- `isBusyRef` — 모든 AI 표면 공유 동시 실행 방지
- Python agent: content_draft(카피라이팅) / content_image(FAL.AI) 2단계 파이프라인
- NestJS API: draft-content, preview, trigger-image-gen, text-ai/transform 엔드포인트

## Constraints

- **Tech stack**: 기존 스택 유지 (NestJS + Next.js + Prisma + PostgreSQL)
- **DB**: Native PG enum 금지 → String + validation
- **Architecture**: 프론트 → NestJS API → DB 흐름 유지
- **Frontend**: 'use client' only, 라이트 테마, API_BASE fetch 패턴

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 히어로 이미지 기반 통합 생성 | 이미지 분류 불필요, 비주얼 일관성 | ✓ Shipped v1.0 |
| 에디터 페이지 확장 (신규 페이지 X) | 기존 GrapesJS 에디터 활용 | ✓ Shipped v1.0 |
| DB 기반 조회 (API 연동 없음) | 쿠팡 API 키 미확보 | ✓ v2.0 방침 |
| Orders/Returns Prisma 전환 | JSON 파일 직접 읽기 제거 | ✓ Shipped v2.0 |
| KST DATE_TRUNC for 일별 집계 | Prisma groupBy 불가 | ✓ $queryRaw v2.0 |
| sellerProductId JOIN 키 | vendorItemId가 아닌 sellerProductId | ✓ v2.0 검증 |
| 오른쪽 패널 AI 전용 자동 전환 | 텍스트/이미지/디자인 채팅 자동 전환 | ✓ Shipped v2.1 |
| Sync text AI (Gemini inline) | <3s 응답, NestJS 경유 | ✓ Shipped v2.1 |
| isBusy ref 공유 | 모든 AI 표면 동시 실행 방지 | ✓ Shipped v2.1 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-27 after v2.1 milestone completion*
