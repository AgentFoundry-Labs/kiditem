# Stack Research

**Domain:** 이커머스 운영 대시보드 (쿠팡 주문/반품/상품 데이터 통합)
**Researched:** 2026-03-25
**Confidence:** HIGH — all versions confirmed via npm registry; findings grounded in existing codebase analysis

---

## What Already Exists (Do NOT Re-add)

The following are already present in the project and require zero changes:

| Technology | Version (installed) | Role |
|------------|---------------------|------|
| Next.js | 14.2.35 | Frontend framework |
| NestJS | 11.x | Backend API |
| PostgreSQL + Prisma | 7.5.0 | ORM + DB |
| recharts | 3.8.1 (installed: ^3.8.0) | Charts — already in `apps/web/package.json` |
| date-fns | 4.1.0 (installed: ^4.1.0) | Date formatting — already installed |
| tsx | 4.21.0 | Seed script runner — already in devDeps |
| zustand | 5.0.12 | State management — already installed |
| lucide-react | 0.577.0 | Icons — already installed |
| tailwindcss | 3.4.1 | Styling — already installed |

---

## Recommended Stack Additions

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@tanstack/react-table` | ^8.21.3 | 주문/반품/상품 목록 테이블 — 정렬, 필터, 페이지네이션 | Headless 설계라 Tailwind와 충돌 없음. 1,000행+ 데이터셋에서도 선언적 필터/정렬 API가 직관적. recharts처럼 이미 프로젝트의 헤드리스 패턴(Radix UI)과 일치. AG Grid는 오버엔지니어링. |
| `date-fns-tz` | ^3.2.0 | 쿠팡 타임스탬프 KST 파싱 | 쿠팡 WING API 응답 타임스탬프(`orderedAt: "2026-03-23T13:59:41"`)는 timezone suffix 없는 KST 암묵적 표기. 기존 `date-fns` ^4.x와 peer dependency 호환. PostgreSQL에는 UTC로 변환해 저장해야 함. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `zod` | ^4.3.6 | JSON 임포트 시 데이터 검증 | seed.ts에서 JSON 파싱할 때 필드 누락/타입 불일치 방어. prisma `@@map` 컨벤션과 별개로 임포트 레이어에서만 사용. 298건 주문 + 20건 반품 + 1,131개 상품 임포트 시 실행 전 스키마 검증. |
| `@tanstack/react-virtual` | ^3.13.23 | 가상 스크롤 (1,000행+ 목록) | 반드시 필요하지 않음 — 298건 주문은 페이지네이션으로 충분. 상품 1,131개 표시 시 고려. TanStack Table과 동일 생태계라 통합 패턴 문서화됨. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `tsx` (이미 설치됨) | `prisma/seed.ts` 실행 | 루트 `package.json`의 `db:seed` 스크립트가 이미 `tsx prisma/seed.ts` 사용. 추가 설치 불필요. |
| Prisma Studio (이미 설치됨) | 임포트 결과 빠른 확인 | `npm run db:studio`. 시드 후 데이터 구조 검증에 유용. |

---

## Installation

```bash
# apps/web — 프론트엔드 테이블 + timezone
npm install @tanstack/react-table date-fns-tz --workspace=apps/web

# 루트 — seed.ts 임포트 검증 (tsx는 이미 있음)
npm install zod --workspace=apps/web
# zod는 seed.ts가 루트에 있으므로 root deps에도 필요할 수 있음:
# npm install zod -w .   (루트 package.json에 없으면)

# @tanstack/react-virtual — 상품 목록이 1,000행+ 필요 시에만 추가
# npm install @tanstack/react-virtual --workspace=apps/web
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@tanstack/react-table` | `AG Grid Community` | 엑셀 스타일 인라인 편집이 필요한 경우. 이번 밀스톤은 읽기 전용 대시보드라 AG Grid 복잡도 불필요. |
| `@tanstack/react-table` | 직접 `<table>` 구현 | 단순 5열 이하 고정 테이블. 주문 목록은 정렬/필터/페이지네이션 필요해 직접 구현 비용이 더 큼. |
| `date-fns-tz` | `luxon` | 풍부한 i18n 포맷팅 필요 시. 이번 프로젝트는 KST↔UTC 변환만 필요해 `date-fns-tz`가 충분하고 번들 크기 작음. |
| `date-fns-tz` | `dayjs` with timezone plugin | 이미 `date-fns`가 설치되어 있어 같은 생태계 유지가 합리적. |
| `zod` | 수동 타입 단언 (`as SomeType`) | JSON 구조가 완전히 신뢰되는 경우. 쿠팡 원본 JSON은 일부 필드 `null` 혼재(예: `requesterRealPhoneNumber: null`)해 런타임 검증이 안전. |
| `recharts` (이미 있음) | `chart.js`, `visx` | 변경 불필요. recharts 3.x는 이미 설치되어 있고 반품 사유별 통계 차트에 충분. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `AG Grid` (`ag-grid-community`) | Community 라이선스임에도 번들 크기 ~800KB, 헤드리스 Tailwind 스타일링과 충돌. 이번 밀스톤 요구사항 초과. | `@tanstack/react-table` |
| `react-table` v7 | v8 이전 패키지. `@tanstack/react-table` v8로 대체됨. 이름이 혼동되기 쉬움. | `@tanstack/react-table` ^8.x |
| `moment.js` + `moment-timezone` | 유지보수 종료 선언, 번들 크기 ~300KB. 이미 `date-fns`가 설치된 프로젝트에 중복. | `date-fns` + `date-fns-tz` |
| `next-i18n-router` / 로케일 라우팅 | 단일 언어(한국어) 프로젝트. 복잡도만 증가. | KRW 포맷팅은 기존 `formatKRW` 유틸 사용 |
| `react-query` / `@tanstack/react-query` | 현재 프로젝트는 `useEffect + fetch` 패턴 통일. 도입하면 기존 페이지와 패턴 불일치. | 기존 `useEffect + fetch` 패턴 유지 |
| Python pandas / 데이터 임포트 CLI 도구 | seed.ts를 `tsx`로 실행하는 기존 패턴 이미 확립. Python 임포터 추가 시 두 개 런타임 관리. | `prisma/seed.ts` + `tsx` |

---

## Stack Patterns by Variant

**대량 임포트 전략 (298 주문 + 1,131 상품 + 20 반품):**
- `prisma/seed.ts`에 JSON 파일 직접 `require()` 또는 `fs.readFileSync` 후 파싱
- `prisma.createMany()` 사용 (단, Prisma는 `createMany`에서 중첩 관계 미지원 — 주문 헤더 → 아이템은 순차적으로 처리)
- `zod`로 각 레코드 파싱 후 유효하지 않은 레코드는 건너뛰고 로그 출력
- 전체 임포트 완료 후 `console.log` 요약 출력

**쿠팡 타임스탬프 처리:**
- 쿠팡 WING API 응답의 `orderedAt`, `paidAt`, `createdAt` 등은 KST (UTC+9) 암묵적 표기
- 임포트 시: `fromZonedTime(dateString, 'Asia/Seoul')` → UTC Date → Prisma에 저장
- 표시 시: Prisma에서 읽은 UTC Date → `toZonedTime(date, 'Asia/Seoul')` → 한국 시간 표시
- `date-fns-tz` ^3.x의 API: `fromZonedTime` (구 `zonedTimeToUtc`), `toZonedTime` (구 `utcToZonedTime`)

**TanStack Table 기본 패턴 (주문/반품 목록):**
- `useReactTable` + `getCoreRowModel` + `getSortedRowModel` + `getFilteredRowModel` + `getPaginationRowModel`
- 헤드리스: 테이블 구조는 기존 `border-gray-200`, `text-gray-900` Tailwind 클래스로 직접 렌더링
- 초기 페이지 크기: 20행 (`initialState: { pagination: { pageSize: 20 } }`)

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@tanstack/react-table` ^8.21.3 | React ^18, TypeScript ^5 | 현재 프로젝트 버전과 호환. |
| `date-fns-tz` ^3.2.0 | `date-fns` ^4.x | date-fns-tz v3는 date-fns v3/v4 모두 지원. 현재 설치된 date-fns ^4.1.0과 호환. |
| `zod` ^4.3.6 | TypeScript ^5, Node ^18 | 현재 프로젝트와 호환. seed.ts는 tsx로 실행되므로 ESM/CJS 호환 이슈 없음. |
| `recharts` ^3.8.0 (기존) | React ^18 | 재설치 불필요. 반품 사유별 PieChart / 주문 상태별 BarChart에 활용 가능. |

---

## Sources

- npm registry (2026-03-25 확인): `@tanstack/react-table@8.21.3`, `date-fns-tz@3.2.0`, `zod@4.3.6`
- `apps/web/package.json` 직접 분석 — recharts, date-fns, tsx, zustand 이미 설치 확인
- `data/coupang_orders_raw.json` 구조 분석 — 298건, KST implicit timestamp 패턴 확인
- `data/coupang_returns_raw.json` 구조 분석 — faultByType, reasonCode, returnItems 필드 확인
- `prisma/seed.ts` 분석 — tsx + PrismaClient + PrismaPg 어댑터 패턴 확인
- date-fns-tz v3 API 변경 확인: `fromZonedTime` / `toZonedTime` (v3에서 이름 변경됨)

---

*Stack research for: 쿠팡 운영 데이터 통합 (주문/반품/상품 임포트 + 운영 대시보드)*
*Researched: 2026-03-25*
