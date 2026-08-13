# 재고 관리 단일 작업공간 설계

- 상태: 승인됨
- 작업: KID-23
- 날짜: 2026-08-13

## 배경

KID-23의 1차 UI 정리로 `/inventory-hub`는 `재고 현황`과 `셀피아 재고` 두 탭을
소유하게 됐다. 두 탭은 모두 `GET /api/inventory/sellpia-skus`의 최신 Sellpia
스냅샷을 조회하지만 서로 다른 표와 필터를 렌더링한다.

`재고 현황`은 동기화, 바코드, Excel, 요약 카드와 기본 재고 표를 제공하고,
`셀피아 재고`는 활성 상태, 상품·채널 옵션 연결 상태와 상세한 SKU 표를 제공한다.
운영자가 확인하는 원본과 대상이 같기 때문에 두 화면을 분리하면 어느 탭을 기준으로
작업해야 하는지 불명확하고, 검색·재고 상태·pagination·로딩·오류 처리가 중복된다.

이번 설계는 1차 설계의 두 탭 결정을 대체한다. 재고 관리의 공개 화면과 frontend
데이터 흐름을 하나의 Sellpia 재고 작업공간으로 통합한다.

## 목표

1. `/inventory-hub`의 상위 탭을 제거하고 단일 `재고 관리` 작업공간을 표시한다.
2. 동기화·바코드·Excel·요약과 활성·연결 상태를 하나의 필터 및 표에 합친다.
3. Sellpia SKU 목록 요청과 URL 상태를 하나의 소유 컴포넌트로 통합한다.
4. 화면에 노출할 필요가 없는 `Sellpia SKU ID`를 숨기고 업무용 식별자만 표시한다.
5. 과거 탭 URL과 활성 링크를 탭 없는 canonical `/inventory-hub`로 정규화한다.
6. 재고 이동 및 반품 기록은 통합 재고 목록 아래의 독립 섹션으로 유지한다.

## 비목표

- Sellpia 스냅샷 API, 가져오기 작업 또는 재고 기준 데이터를 변경하지 않는다.
- KidItem에서 Sellpia 현재고를 직접 수정하는 기능을 추가하지 않는다.
- 상품·채널 옵션 연결 규칙이나 자동 생성 `MasterProduct` 식별자를 변경하지 않는다.
- `/inventory`의 독립 운영 화면 계약을 폐기하거나 redirect로 바꾸지 않는다.
- `/stock-ops`, `/rocket-orders`, 구매 발주 또는 창고 이관 도메인을 재설계하지 않는다.
- 입출고 및 반품 record의 API나 mutation을 변경하지 않는다.

## 검토한 접근

### 1. 단일 작업공간과 단일 표

상위 탭을 없애고 상세한 Sellpia SKU 표에 기존 재고 현황의 도구와 요약을 합친다.
화면과 요청의 중복이 함께 사라지고 운영 기준이 하나가 되므로 이 방식을 채택한다.

### 2. 탭만 없애고 두 섹션을 세로로 배치

변경 위험은 낮지만 같은 SKU를 두 표에서 반복하고 필터와 오류 상태도 이중으로
유지한다. 사용자의 중복 문제를 근본적으로 해결하지 못한다.

### 3. 단일 표에 `재고 중심`과 `연결 중심` 보기 모드 추가

열 밀도를 조절할 수 있지만 탭과 유사한 선택을 다시 만들고 별도 상태와 테스트가
필요하다. 현재 데이터 규모와 운영 목적에는 불필요한 복잡성이다.

## 최종 화면 구성

`/inventory-hub`는 `TabLayout`과 `tab` 선택 상태 없이 다음 순서로 렌더링한다.

1. `재고 관리` 제목, Sellpia 동기화, 바코드 출력, Excel 내보내기
2. Sellpia가 현재고의 기준이라는 읽기 전용 안내와 마지막 성공 가져오기 시각
3. 전체 SKU, 재고 있음, 품절 요약 카드
4. 검색, 재고 상태, 활성 상태, 상품 연결 상태를 합친 필터 영역
5. 현재 필터 결과 수와 background refresh 상태
6. 단일 Sellpia SKU 표와 pagination
7. 구분선 아래 재고 이동 기록과 반품 이동 기록

표는 운영 판단에 필요한 다음 정보를 제공한다.

- 상품명과 옵션명
- Sellpia 코드와 바코드
- 매입가와 판매가
- 현재고
- 활성 또는 비활성 상태
- 연결 상품과 연결 채널 옵션
- 최종 가져오기 시각

`sellpiaInventorySkuId`는 React row key와 API 관계 식별자로만 사용하고 표에서는
노출하지 않는다. `INV-SELLPIA-*` 및 UUID 기반 `CP-*` 상품 코드는 기존 공유
운영자 표시 정책에 따라 계속 숨긴다. Sellpia 코드, 바코드, 채널 외부 식별자처럼
업무에 필요한 값은 유지한다.

## 컴포넌트 경계

`InventoryWorkspace`가 통합 목록의 유일한 orchestration component가 된다. URL
필터 상태, React Query 요청, export 범위, refresh 표시와 pagination을 소유한다.
화면 요소는 다음의 작은 표현 컴포넌트로 분리한다.

- `InventoryToolbar`: 제목, 동기화, 바코드, Excel, 최신 가져오기 안내
- `InventorySummaryCards`: 전체, 재고 있음, 품절 요약
- `InventoryFilters`: 검색, 재고, 활성, 연결 상태
- `InventoryTable`: 통합 열, 연결 상세, 빈 상태

기존 `SellpiaInventoryWorkspace`, `SellpiaInventoryFilters`,
`SellpiaInventoryTable`의 유효한 기능은 위 경계로 흡수한다. 흡수가 끝나면 별도
workspace와 중복 기본 표·필터 컴포넌트를 삭제한다. 재고 이동과 반품 이동 컴포넌트는
각자의 요청과 mutation을 유지하며 통합 목록 내부로 섞지 않는다.

`/inventory`는 기존 route contract에 따라 독립 화면으로 남고 같은
`InventoryWorkspace`를 재사용한다. `/inventory-hub`만 이동·반품 섹션을 추가로
조합한다.

## URL과 탐색 계약

통합 목록의 상태는 다음 query parameter를 source of truth로 사용한다.

| Parameter | 의미 | 기본값 |
|---|---|---|
| `search` | Sellpia 코드, 상품명, 옵션명, 바코드 검색 | 빈 값 |
| `stockStatus` | `all`, `in_stock`, `out_of_stock` | `in_stock` |
| `activeStatus` | `all`, `active`, `inactive` | `all` |
| `linkStatus` | `all`, `linked`, `unlinked` | `all` |
| `page` | 1부터 시작하는 페이지 | `1` |

필터를 바꾸면 `page=1`로 돌아가며, 관련 없는 query parameter는 보존한다. 상품
상세로 이동한 뒤 `이전 화면`을 누르면 브라우저 이력이 이 검색·필터·페이지를 그대로
복원한다.

`tab`은 더 이상 공개 상태가 아니다. `?tab=status`,
`?tab=sellpia-inventory`, 기존에 제거된 탭 값과 알 수 없는 값까지 모든 `tab`
parameter는 다른 query parameter를 보존하면서 제거하고 canonical URL로
`replace`한다. 앱 내부의 재고 관리 링크는 모두 `/inventory-hub` 또는 필요한 목록
필터를 포함한 URL을 사용한다. 저장된 링크의 호환성은 유지하되 UI에서 탭을 복원하지
않는다.

## 데이터와 export 흐름

통합 목록은 계속 `GET /api/inventory/sellpia-skus` 한 요청 계약을 사용한다. 검색,
재고 상태, 활성 상태, 연결 상태와 pagination을 요청 query와 React Query cache key에
동일하게 반영한다. frontend 공유 API parameter type은 서버가 이미 지원하는 활성 및
연결 상태를 포함하도록 확장한다.

바코드와 Excel은 화면의 검색·재고·활성·연결 필터를 그대로 적용한 전체 결과를
pagination 단위로 가져온다. 따라서 사용자가 보고 있는 범위와 export 범위가
달라지지 않는다. 동기화 완료 시 같은 inventory query family를 invalidate하여 별도
탭 데이터와의 일관성 문제를 만들지 않는다.

재고 이동과 반품 기록은 각자의 API 흐름을 유지한다. 통합 Sellpia 목록 요청과
결합하거나 하나의 거대한 loading boundary로 만들지 않는다.

## 로딩, 오류와 빈 상태

초기 목록 로딩은 table skeleton을 표시한다. URL 필터 변경이나 수동 새로고침 중에는
이전 결과를 유지하고 목록 위에 background refresh 상태를 표시한다. API 오류가
발생하면 마지막 성공 결과가 있으면 표를 보존하면서 inline 오류를 알리고, 결과가
없으면 표 영역에 오류 상태를 표시한다.

필터 결과가 비어 있으면 현재 필터를 해제할 수 있다는 안내를 포함한 하나의 빈 상태를
표시한다. 동기화, 바코드와 Excel 오류는 기존 toast 정책을 유지한다. popup 차단과
export할 결과가 없는 경우도 현재 사용자 메시지를 유지한다.

## 문서와 계약 변경

- `(inventory)/AGENTS.md`는 `/inventory-hub`가 탭 없는 단일 Sellpia 재고
  작업공간임을 기록한다.
- `docs/ARCHITECTURE.md`의 route map과 exact tab ownership 문구를 단일 작업공간
  계약으로 갱신한다.
- Sellpia 재고 접근 경로를 설명하는 runbook과 `docs/DEV_DATA_BUNDLES.md`의 smoke
  URL을 canonical `/inventory-hub`로 갱신한다.
- dashboard, readiness, `/stock-ops` 등 활성 소비자의 `?tab=status` 링크를
  `/inventory-hub`로 바꾼다.
- 이 교차 route 수정은 canonical 재고 링크 정리를 위한 공유 내비게이션 예외이며,
  해당 화면의 다른 동작이나 레이아웃은 변경하지 않는다.
- 1차 `재고 관리 UI 통합 설계`의 두 탭 결정은 이 명세가 대체한다. 1차 설계의 삭제
  화면, 사이드바, retired route와 자동 동기화 보존 결정은 계속 유효하다.

## 테스트 전략

구현은 TDD 순서를 따른다.

1. `/inventory-hub`가 탭 없이 하나의 `InventoryWorkspace`와 이동·반품 섹션을
   렌더링하는 실패 테스트를 작성한다.
2. 과거 모든 `tab` 값을 제거하면서 검색·필터 등 다른 query parameter를 보존하는
   실패 테스트를 작성한다.
3. 통합 URL state hook이 검색, 재고, 활성, 연결, pagination을 요청과 URL에 동일하게
   반영하는 실패 테스트를 작성한다.
4. 통합 표가 연결 정보를 표시하면서 `Sellpia SKU ID`와 내부 상품 코드를 노출하지
   않는 실패 테스트를 작성한다.
5. 바코드와 Excel의 전체-page 조회가 현재 검색·재고·활성·연결 필터를 전달하는 실패
   테스트를 작성한다.
6. 중복 workspace와 표·필터 파일이 제거됐음을 inventory retirement 테스트로
   고정한다.
7. dashboard, readiness, stock-ops 링크와 문서의 canonical URL을 scanner 및 관련
   테스트로 검증한다.
8. 관련 inventory와 catalog 테스트, `npm run check:agents-hygiene`,
   `npm run build --workspace=apps/web`을 실행한다.
9. 브라우저에서 탭 부재, 필터 URL, 단일 표, 내부 ID 부재, 상품 상세 복귀,
   이동·반품 섹션을 확인한다.

## 완료 기준

- `/inventory-hub`에 `재고 현황`과 `셀피아 재고` 탭이 없고 하나의 재고 관리
  작업공간만 보인다.
- 동기화, 바코드, Excel, 요약, 검색, 재고·활성·연결 필터와 pagination이 한 표를
  제어한다.
- 목록 API 요청과 cache key가 한 상태 모델을 사용하며 중복 목록 요청이 없다.
- `Sellpia SKU ID`와 내부 상품 코드는 보이지 않고 업무용 식별자는 유지된다.
- 과거 탭 URL은 다른 필터를 잃지 않고 canonical `/inventory-hub`로 정규화된다.
- 상품 상세 복귀는 직전 목록의 URL 상태를 복원한다.
- 재고 이동과 반품 이동 섹션은 기존 기능을 유지한다.
- 관련 테스트, instruction hygiene, frontend build와 브라우저 검증이 모두 통과한다.
