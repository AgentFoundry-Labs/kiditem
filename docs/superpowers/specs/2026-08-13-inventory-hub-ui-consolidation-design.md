# 재고 관리 UI 통합 설계

- 상태: 승인됨
- 작업: KID-23
- 날짜: 2026-08-13

## 배경

현재 `/inventory-hub`는 `재고 현황`, `Sellpia 동기화`, `로켓 수동 처리`
탭을 노출한다. 별도로 상품 관리 사이드바의 `셀피아 재고`가
`/product-hub/options`의 읽기 전용 Sellpia SKU 화면으로 연결된다. 이 구조는
재고 관련 화면을 서로 다른 메뉴와 라우트 그룹에 흩어 놓고, 더 이상 운영 진입점으로
사용하지 않을 동기화 이력과 Rocket 수동 화면까지 상위 탭으로 유지한다.

이번 변경은 탭을 숨기는 수준이 아니라 화면 소유권과 공개 라우트를 정리한다.

## 목표

1. `/inventory-hub`의 상위 탭을 `재고 현황`, `셀피아 재고` 두 개로 고정한다.
2. `/product-hub/options`의 읽기 전용 Sellpia SKU 화면을 재고 관리 라우트가 직접
   소유하도록 이동한다.
3. `Sellpia 동기화`, `로켓 수동 처리` 탭과 두 탭만을 위한 UI 코드를 제거한다.
4. 상품 관리 사이드바의 `셀피아 재고` 항목과 `/product-hub/options` 공개 라우트를
   제거한다.
5. URL 상태, 링크, 테스트, scoped `AGENTS.md`, 아키텍처 문서를 새 구조와 일치시킨다.

## 비목표

- Sellpia 스냅샷 갱신 API나 OperationRun 기반 자동 동기화 기능을 제거하지 않는다.
- `재고 현황` 안의 동기화 실행 버튼, 바코드 출력, Excel 내보내기 동작을 바꾸지 않는다.
- `/stock-ops`의 `상품 유출`, `채널 재고 0` 분석 화면을 변경하지 않는다.
- `/rocket-orders`나 구매 발주 도메인의 Rocket 운영 화면을 변경하지 않는다.
- Sellpia SKU와 상품·채널 옵션 연결 규칙 또는 백엔드 API 계약을 변경하지 않는다.

## 검토한 접근

### 1. 탭과 사이드바만 숨기기

기존 라우트와 컴포넌트를 그대로 두고 내비게이션만 감추는 방법이다. 변경량은 작지만
죽은 공개 화면과 잘못된 소유권이 남으므로 이번 정리 목적에 맞지 않는다.

### 2. 화면 소유권을 재고 관리로 이동하고 기존 UI를 삭제하기

읽기 전용 Sellpia SKU 화면을 inventory route group으로 옮기고, 사용하지 않는 탭,
라우트, 전용 컴포넌트를 삭제한다. 공개 UI와 코드 구조가 일치하므로 이 방식을 채택한다.

### 3. Sellpia SKU 표를 `재고 현황`에 합치기

상위 탭 수는 하나로 줄지만 두 표의 목적과 필터가 섞여 화면이 지나치게 길어지고,
사용자가 요청한 `셀피아 재고` 탭 이동과도 다르다.

## 최종 화면과 라우트

`/inventory-hub`는 중첩 탭 없이 다음 두 탭만 렌더링한다.

| 탭 ID | 레이블 | 내용 |
|---|---|---|
| `status` | `재고 현황` | 현재 재고 현황, 재고 이동, 반품 이동 기록 |
| `sellpia-inventory` | `셀피아 재고` | Sellpia SKU 단위 읽기 전용 재고와 상품·채널 옵션 연결 상태 |

기본 탭은 `status`다. `셀피아 재고` 탭의 검색, 페이지, 재고 상태, 활성 상태,
연결 상태는 현재와 같이 URL query parameter로 유지하며, 상태 변경 시
`tab=sellpia-inventory`를 보존한다.

`/product-hub/options`는 리다이렉트 없이 폐기한다. 중앙 retired-route scanner가
사이드바 링크와 App Router entrypoint가 모두 사라졌음을 보장한다. 코드 내부의 모든
활성 소비자는 새 canonical URL인 `/inventory-hub?tab=sellpia-inventory`로 이동한다.

삭제된 `sellpia-sync`, `rocket-events`와 그 화면으로 향하던 과거 탭 값은 새 화면을
복원하지 않는다. 저장된 `/inventory-hub` 링크가 빈 화면에 머물지 않도록
`LEGACY_TAB_TARGETS`에서 `status`로만 정규화한다. 동기화가 필요한 readiness 링크와
`/stock-ops`의 과거 freshness 링크도 동기화 실행 버튼이 남아 있는 `재고 현황`으로
연결한다.

## 컴포넌트 소유권

`ProductOptionsWorkspace`는 inventory route group으로 이동하고 역할에 맞게
`SellpiaInventoryWorkspace`로 이름을 바꾼다. 함께 사용되는 필터와 표도
`inventory-hub/components` 아래로 이동한다. 이 세 컴포넌트는 기존 API,
React Query key, 읽기 전용 정책, 상품 상세 및 레시피 구성 링크를 그대로 유지한다.

다음 화면 전용 코드는 소비자가 없어진 뒤 삭제한다.

- Sellpia 동기화 이력 화면과 `ImportFreshness`
- Rocket 수동 처리 workspace와 `ChannelAvailability`
- `/product-hub/options` route entrypoint와 route-only guide
- 이전 소유권만 검증하던 호환 페이지 및 catalog boundary 테스트 조항

공유 Sellpia 동기화 action, freshness API, readiness 상태처럼 다른 활성 화면이
사용하는 기능은 삭제하지 않는다.

## 데이터 흐름과 오류 처리

이동된 `셀피아 재고` 탭은 계속
`GET /api/inventory/sellpia-skus`를 호출한다. 필터와 pagination은 요청 query와
React Query cache key에 동일하게 반영한다. 로딩, background refresh, 빈 결과,
API 오류 UI도 기존 동작을 보존한다.

탭을 오갈 때 비활성 탭은 unmount되어 불필요한 요청을 만들지 않는다. 다시 진입하면
URL에 남은 Sellpia 필터 상태로 쿼리를 재구성한다. 이 변경은 데이터 mutation을
추가하지 않는다.

## 문서와 계약 변경

- `(inventory)/AGENTS.md`는 `/inventory-hub`의 정확한 두 탭과 읽기 전용 Sellpia SKU
  소유권을 기록한다.
- `(catalog)/AGENTS.md`와 `product-hub/AGENTS.md`에서 `/product-hub/options`
  소유권을 제거한다.
- 삭제되는 `product-hub/options/AGENTS.md`의 유효한 읽기 전용 규칙은 inventory
  guide로 옮긴다.
- `docs/ARCHITECTURE.md`의 Frontend Route Map과 정확한 탭 계약을 갱신한다.
- scoped instruction 파일 변경 후 `npm run check:agents-hygiene`를 실행한다.

## 테스트 전략

구현은 TDD 순서를 따른다.

1. `/inventory-hub`가 정확히 두 탭을 렌더링하고 `셀피아 재고` 탭에서 이동된
   workspace를 노출하는 실패 테스트를 작성한다.
2. 삭제 탭 및 레거시 탭 값이 `status`로 정규화되는 실패 테스트를 작성한다.
3. 사이드바에서 상품 관리의 `셀피아 재고` 항목이 사라지는 실패 테스트를 작성한다.
4. retired-route scanner에 `/product-hub/options`를 추가하고, 라우트가 아직 있어
   실패하는 것을 확인한다.
5. 이동된 workspace의 URL 상태가 `tab=sellpia-inventory`를 보존하는 실패 테스트를
   작성한다.
6. 전용 화면 파일 삭제를 검증하는 inventory retirement 테스트를 갱신한다.
7. 최소 구현으로 각 테스트를 통과시킨 뒤 관련 route/component 테스트를 함께 실행한다.
8. `npm run check:agents-hygiene`, `npm run build --workspace=apps/web`을 통과시키고
   브라우저에서 탭, 사이드바, 필터, 삭제된 라우트를 확인한다.

## 완료 기준

- 재고 관리 화면에 `재고 현황`, `셀피아 재고`만 보인다.
- `셀피아 재고` 탭의 표, 필터, pagination, 새로고침과 상품 링크가 동작한다.
- 사이드바에 별도 `셀피아 재고` 메뉴가 없다.
- `Sellpia 동기화`, `로켓 수동 처리` 화면 코드와 `/product-hub/options` route
  entrypoint가 저장소에 남지 않는다.
- 삭제 화면으로 향하는 활성 링크가 없다.
- 관련 테스트, instruction hygiene, frontend build, 브라우저 검증이 모두 통과한다.
