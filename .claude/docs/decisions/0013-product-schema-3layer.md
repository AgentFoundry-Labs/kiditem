---
id: 0013
title: Product schema 3-layer redesign (non-coexistence)
status: Accepted
date: 2026-04-17
supersedes: []
superseded-by: null
affects:
  - prisma
  - apps/server
  - apps/server/src/products
  - apps/web
  - packages/shared
---

# ADR-0013: Product 스키마 3-레이어 전환

Related spec: [docs/superpowers/specs/2026-04-17-product-schema-redesign-design.md](../../../docs/superpowers/specs/2026-04-17-product-schema-redesign-design.md)

## Context

기존 `MasterProduct` (바코드 단위 SKU) 와 `Product` (쿠팡 listing) 가 의미 혼재.
`sku`, `barcode`, `costPrice/sellPrice` 가 두 테이블 중복, `Inventory` 와
`MasterInventory` 로 재고 분산, 옵션(`ProductItem`)이 쿠팡 listing 에 종속.
멀티채널 (네이버/11번가/자사몰) 확장 및 AI 에이전트 reasoning 명확성을 위해
업계 표준 3-레이어 (Family / SKU / Channel Listing) 재설계.

실운영 상태가 아니므로 V2 suffix coexistence 없이 **통째 교체**.
Plan A (schema) / Plan B (service rewrite) / Plan C (Wing 이관) 3-plan 순차 실행.

## Decision

**3-레이어 구조**:
- `MasterProduct` (family, 기획상품) — 예: "3000감정잔디인형"
- `ProductOption` (물리 SKU, 바코드 단위) — 예: 몽실이/두근이
- `ChannelListing` (채널 등록) — 쿠팡 등록상품ID 등

**ID 체계 3-tier**:
- Internal UUID PK
- Canonical code (`M-00000001`, `M-00000001-01`, `{channel}_{externalId}`)
- External IDs (legacyCode 셀피아, barcode EAN13, externalId 채널)

**핵심 선택**:
- Master.code: Postgres sequence (global unique)
- Option.sku: `MasterProduct.optionCounter` 원자적 UPDATE (race-free, soft-delete 무관)
- Bundle: `ProductOption.isBundle` + `BundleComponent` (cross-master 허용, cross-company 금지)
- Bundle 재고: `ProductOption.availableStock` materialize
- 전역 unique (`barcode`, `legacyCode`) → `@@unique([companyId, ...])` (멀티테넌트)
- 기존 `Product`/`MasterProduct`(old)/`ProductItem`/`MasterInventory`/`BundleProduct` **drop**
- 모델 이름 coexistence 없이 원래 이름 재사용 (v2 suffix 불필요)

## Consequences

**Positive**:
- 업계 표준 호환 (Shopify/사방넷/셀피아 매핑 직관)
- 에이전트 reasoning 명확 (레이어별 책임 분리)
- 멀티채널 확장 시 ChannelListing 재사용
- 재고 단일 소스 (Option 1:1 Inventory)
- 가격 중복 제거 (Master 에 원가 없음, Option 에 원가, Listing 에 채널 노출가)

**Negative**:
- 3-plan 중 Plan A 종료 시 서버 부팅 불가 (Plan B 에서 service 복구)
- 기존 products/, bundle-products/ 등 module 삭제 → 관련 API 일시 404
- Frontend (apps/web) 도 관련 페이지 일시 깨짐 허용 (Plan D 후속)

**Neutral**:
- RLS 정책 7개 신규 테이블 추가 (기존 11 → 18)
- `companyId` denormalize (성능상 정당화)

## Follow-ups
- Issue #24 — 무결성 불완전 33건 수기 정리
- Plan B — NestJS module rewrite (products-v2)
- Plan C — Wing 파일 이관
- ADR-0014 (예정) — frontend 재배선 전략
