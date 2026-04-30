# web/return-scan — Barcode Input + Local-Only Logging

바코드 스캐너 기반 반품 수령 UI. **모든 state 가 local, mutation 0**.

## Structure

```
return-scan/
├── page.tsx
├── components/
│   ├── BarcodeScanInput.tsx
│   ├── ReturnProductInfo.tsx
│   ├── ReturnScanHeader.tsx
│   └── ScanLogTable.tsx
```

## 핵심 패턴

### 1. Stateless Barcode Flow

page.tsx:28-60 — 흐름:
1. 사용자 input (`barcode` state)
2. Enter → `submitted` state set
3. `useQuery({ queryKey: queryKeys.products.list({ search: submitted }), enabled: !!submitted })`
4. 결과 도착 → 자동 첫 매칭 select (useEffect)
5. ProductInfo 표시 + scanLog 에 추가

**서버에 mutation 없음** — 순수 search.

### 2. Local-Only Scan Log

page.tsx:63-76 — `scanLogs` 는 useState array. **DB persistence 없음**. 페이지 새로고침 시 사라짐.

이유: 빠른 반품 수령 UX 우선. 영구 기록은 별도 시스템 (또는 향후 기능).

### 3. Local Sync 예외 (auto-select)

page.tsx:49-53 — `useEffect` 로 첫 검색 결과 자동 선택. 일반적인 useQuery 패턴 위반이지만 **scanner UX 단순화** 정당화.

### 4. Barcode Input UX

- `inputRef` 로 자동 focus
- Enter 로 submit
- `font-mono` 클래스 (바코드 가독성)
- Status 새 스캔마다 reset (sticky error 없음)

## Rules

- 스캔 로그는 **client-side array only** (mutation 없음)
- Product lookup 은 search-only (`/api/products?search=X`) — ID 기반 detail 호출 안 함
- ScanLogTable 컬럼: timestamp / barcode / product name / status
- Input field monospace 강제 (바코드 UX)
- 새 스캔마다 error/successMsg reset

## Prohibits

- ❌ Scan 결과 서버 persist (현재 의도가 ephemeral)
- ❌ Keyboard scanner 추상화 라이브러리 도입 (raw input + Enter 단순)
- ❌ Auto-select 외 UX 변경 (스캔 속도 우선)

## Cross-domain deps

- `apiClient` — `/api/products?search=X` 만 (product list)
- `@kiditem/shared` — 없음 (`ProductInfo` 는 inline 타입)

## 함께 수정할 파일 맵

| 수정 시 | 같이 봐야 할 파일 |
|---|---|
| Scan 결과 persist 도입 | `page.tsx` (useMutation 추가) + 백엔드 endpoint 신규 + `prisma/schema.prisma` (테이블) |
| Keyboard scanner 디바이스 통합 | `BarcodeScanInput.tsx` (MediaDevices/HID API) — scoped plan/instruction update 필요 (의도가 raw 단순화임) |
| 검색 기준 변경 (search → barcode field) | `page.tsx:queryKey` + 백엔드 search 로직 |
| ScanLog UX (정렬/필터/내보내기) | `ScanLogTable.tsx` + page state |
