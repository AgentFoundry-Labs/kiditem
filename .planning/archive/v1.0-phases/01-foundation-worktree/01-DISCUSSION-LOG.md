# Phase 1: Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26
**Phase:** 01-foundation
**Areas discussed:** Auto-decided (user requested autonomous mode)

---

## Auto-Decision Mode

User said "너가 알아서 해" (handle it yourself) — all gray areas auto-decided based on research findings.

### Coupang ID Storage Type

| Option | Description | Selected |
|--------|-------------|----------|
| String (@db.VarChar(30)) | Safe from BigInt serialization errors, simple JSON handling | ✓ |
| BigInt (Prisma BigInt) | Native numeric type, but JSON.stringify throws TypeError | |
| Int (Prisma Int) | Would lose precision on 19-digit IDs | |

**User's choice:** Auto — String (per PITFALLS.md recommendation)
**Notes:** returnDeliveryId confirmed as 19 digits in actual data

### Order Model Structure

| Option | Description | Selected |
|--------|-------------|----------|
| 2-tier (CoupangOrder + CoupangOrderItem) | Maps 1:1 to Coupang API structure (shipmentBox → items) | ✓ |
| Flat (single enriched Order) | Simpler but loses item-level data | |
| 3-tier (Order + ShipmentBox + Item) | Over-engineered for current needs | |

**User's choice:** Auto — 2-tier (per ARCHITECTURE.md recommendation)

### Seed Script Organization

| Option | Description | Selected |
|--------|-------------|----------|
| Separate seed-coupang.ts | Independent from demo seed, focused on real data | ✓ |
| Extend existing seed.ts | All in one file, but mixes demo and real data | |

**User's choice:** Auto — Separate file (per ARCHITECTURE.md recommendation)

### Timestamp Handling

| Option | Description | Selected |
|--------|-------------|----------|
| parseKST helper + UTC storage | Explicit, correct in Docker UTC environment | ✓ |
| Store as-is (implicit KST) | Simpler but 9hr offset in Docker | |

**User's choice:** Auto — parseKST + UTC (per PITFALLS.md recommendation)

## Claude's Discretion

- Prisma model field types/lengths
- Batch processing strategy in seed script
- Error handling approach for invalid records
- Product.deliveryInfo JSON structure

## Deferred Ideas

None
