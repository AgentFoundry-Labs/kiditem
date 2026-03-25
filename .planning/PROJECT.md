# KidItem

## What This Is

키드아이템 이커머스 운영 자동화 플랫폼. 쿠팡 셀러를 위한 소싱 → AI 가공 → 리스팅 → 운영 전체 파이프라인을 자동화한다. NestJS 백엔드 + Next.js 프론트엔드 + Python 에이전트 모노레포 구조.

## Core Value

셀러가 쿠팡 운영 데이터(주문, 반품, 상품, 정산)를 한 곳에서 보고 의사결정할 수 있어야 한다.

## Current Milestone: v1.0 쿠팡 운영 데이터 통합

**Goal:** 쿠팡 실 데이터 구조에 맞게 DB를 재설계하고, JSON 데이터를 임포트하고, 운영 대시보드를 구축한다.

**Target features:**
- 스키마 재설계 — Order/Product를 쿠팡 API 원본 구조로, Return·Category 모델 신규 추가
- 데이터 임포트 — `data/` JSON → DB 시드 스크립트 (쿠팡 API 없이 정적 임포트)
- 주문 대시보드 — 주문 목록, 배송 상태 추적, 주문 상세 (주문자/수신자/아이템/할인)
- 반품 대시보드 — 반품 목록, 사유별 통계, 책임 구분 (셀러/고객)
- 상품 상세 강화 — 옵션/이미지/배송정책/카테고리 속성 표시

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ 상품 CRUD + 소싱 파이프라인 — existing
- ✓ 워크플로우 엔진 (DAG 기반 자동화) — existing
- ✓ ActivityEvent 시스템 (Object View) — existing
- ✓ 상세페이지 템플릿 (bold-vertical, simple-vertical, oneshot) — existing
- ✓ Agent Task 시스템 (Python 워커) — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] 쿠팡 원본 구조 기반 주문 모델 재설계
- [ ] 반품/교환 모델 신규 추가
- [ ] 상품 상세 정보 확장 (옵션, 이미지, 배송정책)
- [ ] 카테고리 모델 추가
- [ ] JSON 데이터 임포트 시드 스크립트
- [ ] 주문 대시보드 (목록, 상세, 배송 추적)
- [ ] 반품 대시보드 (목록, 사유 분석, 책임 구분)
- [ ] 상품 상세 페이지 강화

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- 쿠팡 API 실시간 연동 — API 키 미보유, 추후 확보 시 추가
- 정산(Settlement) 모델 — 데이터 비어있음, 구조 확정 후 추가
- 교환(Exchange) 모델 — 데이터 비어있음, 구조 확정 후 추가
- 실시간 배송 추적 — API 연동 필요, 이번엔 정적 데이터만

## Context

- 쿠팡 셀러 "거영" 운영 중 (vendorId: A00057379)
- 상품 1,131개, 주문 298건 (최근), 반품 20건의 실 데이터 보유
- 데이터 소스: `data/` 폴더의 JSON 파일 (쿠팡 WING API 응답 덤프)
- 기존 DB에 시드 데이터 50개 상품 + 908개 주문 있으나 구조 단순 → 버리고 재설계
- 모노레포: apps/web (Next.js), apps/server (NestJS), agents/ (Python)
- PostgreSQL + Prisma ORM, Docker Compose 기반

## Constraints

- **Tech stack**: 기존 스택 유지 (NestJS + Next.js + Prisma + PostgreSQL)
- **No API**: 쿠팡 API 연동 불가 → data/ JSON 파일 기반으로만 작업
- **Schema convention**: Native PG enum 금지, camelCase 필드 + snake_case DB 컬럼
- **Architecture**: 프론트 → NestJS API → Prisma → DB 레이어 유지

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 기존 Order 데이터 버리고 재설계 | 현재 모델이 쿠팡 원본과 구조적으로 다름 (단순 1행 vs 배송박스+아이템 구조) | — Pending |
| 쿠팡 API 연동 Out of Scope | API 키 미보유 | — Pending |
| JSON 정적 임포트 방식 | API 없이 data/ 파일로 시드 | — Pending |

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
*Last updated: 2026-03-25 after milestone v1.0 initialization*
