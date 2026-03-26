# KidItem

## What This Is

키드아이템 이커머스 운영 자동화 플랫폼. 중국(1688/타오바오) 소싱 상품을 AI로 가공하여 한국 마켓플레이스에 리스팅하는 셀러 운영 도구. Next.js 프론트엔드 + NestJS 백엔드 + Python AI 에이전트 구조.

## Core Value

소싱 상품을 최소한의 수작업으로 판매 가능한 상세페이지로 변환하고, 운영 전반을 하나의 대시보드에서 관리한다.

## Current State

**Shipped:** v2.0 쿠팡 운영 대시보드 (2026-03-26)

주문/반품 운영 대시보드 구축 완료. KPI 카드, 매출 트렌드 차트, 상품 랭킹, 반품 사유 분석, 과실 비율 표시.

## Next Milestone Goals

- 정산 데이터 조회 (수수료, 정산금 추적)
- 문의/리뷰 관리 (SLA 추적)
- 쿠팡 API 실시간 연동 (API 키 확보 시)

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

### Active

<!-- Current scope. Building toward these. -->

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
| DB 기반 조회 (API 연동 없음) | 쿠팡 API 키 미확보 | ✓ v2.0 방침 |
| Orders/Returns Prisma 전환 | JSON 파일 직접 읽기 제거 | ✓ Shipped v2.0 |
| KST DATE_TRUNC for 일별 집계 | Prisma groupBy 불가 | ✓ $queryRaw v2.0 |
| sellerProductId JOIN 키 | vendorItemId가 아닌 sellerProductId | ✓ v2.0 검증 |

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
*Last updated: 2026-03-26 after v2.0 milestone*
