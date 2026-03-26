# KidItem

## What This Is

키드아이템 이커머스 운영 자동화 플랫폼. 중국(1688/타오바오) 소싱 상품을 AI로 가공하여 한국 마켓플레이스에 리스팅하는 셀러 운영 도구. Next.js 프론트엔드 + NestJS 백엔드 + Python AI 에이전트 구조.

## Core Value

소싱 상품을 최소한의 수작업으로 판매 가능한 상세페이지로 변환하고, 운영 전반을 하나의 대시보드에서 관리한다.

## Current Milestone: v2.0 쿠팡 운영 대시보드

**Goal:** `data/` JSON 원본 데이터를 DB에 정규화하고, 주문/반품/정산/상품 운영 화면을 구축한다.

**Target features:**
- 쿠팡 주문 대시보드 (상태별 조회, 상세보기, 통계)
- 반품/교환 관리 화면 (사유 분석, 상태 추적)
- 상품 리스팅 관리 (성과 지표, 광고 ROI)
- 정산 데이터 조회 (수수료, 정산금 추적)
- 문의/리뷰 관리

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- Product data ingestion via Chrome extension (1688/Alibaba)
- AI content generation (Korean copywriting from Chinese product data)
- AI image editing (background replacement, text removal via FAL.AI)
- Template-based detail page rendering (bold-vertical, simple-vertical)
- Workflow engine with AI analysis
- Product sourcing pipeline with status tracking
- DB schema supports intermediate pipeline state (draftContent + pipelineStep) — v1.0 Phase 1
- Two-step pipeline: content_draft (text+colors) → content_image (FAL.AI) — v1.0 Phase 2
- NestJS API: PUT draft-content, GET preview (3-tier fallback), POST trigger-image-gen — v1.0 Phase 3
- Frontend editor with structured editing + pipeline CTA — v1.0 Phase 4
- Coupang order/return DB schema + Prisma-based API — v2.0 prep

### Active

<!-- Current scope. Building toward these. -->

- [ ] 쿠팡 주문 대시보드 (상태별 필터, 상세보기, 통계 카드)
- [ ] 반품/교환 관리 (사유 분석, 상태 추적)
- [ ] 상품 리스팅 관리 (성과 지표, 광고 ROI)
- [ ] 정산 데이터 조회 (수수료, 정산금)
- [ ] 문의/리뷰 관리

### Out of Scope

- 쿠팡 API 실시간 연동 — API 키 미확보, DB 기반 조회만
- 새 템플릿 추가 — 기존 템플릿 활용
- 모바일 앱 — 웹 우선
- 다채널 (스마트스토어, 11번가 등) — 쿠팡 우선

## Context

- `data/` 폴더에 쿠팡 원본 JSON 파일 18개 (주문, 반품, 교환, 정산, 상품, 문의 등)
- coupang_orders (389건), coupang_returns (20건) 이미 DB 시드 완료
- OrdersService/ReturnsService는 Prisma 기반으로 전환 완료
- 정산(settlements), 문의(inquiries) 데이터는 스키마/시드 추가 필요
- 쿠팡 API 키 없음 → 모든 데이터는 DB 조회 기반

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
| DB 기반 조회 (API 연동 없음) | 쿠팡 API 키 미확보 | v2.0 방침 |
| Orders/Returns Prisma 전환 | JSON 파일 직접 읽기 제거 | ✓ Shipped v2.0 prep |

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
*Last updated: 2026-03-26 — Milestone v2.0 started*
