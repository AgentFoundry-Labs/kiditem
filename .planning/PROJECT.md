# KidItem

## What This Is

키드아이템 이커머스 운영 자동화 플랫폼. 중국(1688/타오바오) 소싱 상품을 AI로 가공하여 한국 마켓플레이스에 리스팅하는 셀러 운영 도구. Next.js 프론트엔드 + NestJS 백엔드 + Python AI 에이전트 구조.

## Core Value

소싱 상품을 최소한의 수작업으로 판매 가능한 상세페이지로 변환한다.

## Current Milestone: v1.0 상세페이지 파이프라인 리팩토링

**Goal:** AI 재가공 파이프라인을 단계별로 분리하여 사용자가 중간에 개입/편집할 수 있게 한다.

**Target features:**
- Step 1: 콘텐츠 생성 (한국어 카피 + 테마 컬러) → 원본 이미지로 템플릿 프리뷰
- Step 2: 에디터에서 사용자 편집 (텍스트, 테마 컬러, 히어로 이미지 선택)
- Step 3: 확정된 내용 기반 이미지 생성 (히어로 1장 → 배너/메인/디테일 전부)
- 이미지 분류 단계 제거 — 히어로 기반 통합 생성으로 전환
- 기존 에디터 페이지(/sourcing/[id]/editor) 확장

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- Product data ingestion via Chrome extension (1688/Alibaba)
- AI content generation (Korean copywriting from Chinese product data)
- AI image editing (background replacement, text removal via FAL.AI)
- Template-based detail page rendering (bold-vertical, simple-vertical)
- Workflow engine with AI analysis
- Product sourcing pipeline with status tracking
- ✓ DB schema supports intermediate pipeline state (draftContent + pipelineStep) — Phase 1

### Active

<!-- Current scope. Building toward these. -->

- [ ] 파이프라인 2단계 분리 (콘텐츠 생성 → 이미지 생성)
- [ ] 에디터에서 텍스트/컬러/이미지 편집 후 재가공
- [ ] 히어로 이미지 기반 통합 이미지 생성

### Out of Scope

- 새 템플릿 추가 — 기존 템플릿 활용, 파이프라인 분리에 집중
- Oneshot 파이프라인 변경 — 템플릿 모드만 대상
- 모바일 앱 — 웹 우선

## Context

- 현재 Python ContentAgent (template_pipeline.py)가 분류+콘텐츠+이미지를 한번에 처리
- FAL.AI 이미지 생성이 비용/시간이 큼 (20-40초) → 사용자 확인 후 생성이 합리적
- 에디터는 GrapesJS 기반, DetailPageData 인터페이스 활용
- 이미지 분류 AI가 detail_indices를 선택하는 방식 → 히어로 기반으로 전환하면 불필요
- 프론트엔드는 폴링(3초)으로 처리 상태 감지

## Constraints

- **Tech stack**: 기존 스택 유지 (NestJS + Python agent + FAL.AI)
- **DB**: Prisma + PostgreSQL, native enum 금지
- **Architecture**: 프론트 → NestJS API → DB/Agent 흐름 유지
- **Templates**: DetailPageData 인터페이스 하위 호환 유지

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 히어로 이미지 기반 통합 생성 | 이미지 분류 불필요, 비주얼 일관성, 파이프라인 단순화 | — Pending |
| 에디터 페이지 확장 (신규 페이지 X) | 기존 GrapesJS 에디터 활용, 중복 방지 | — Pending |
| 텍스트+컬러+이미지 편집 범위 | 사용자 최대 자유도 부여 | — Pending |

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
*Last updated: 2026-03-26 after Phase 1 completion*
