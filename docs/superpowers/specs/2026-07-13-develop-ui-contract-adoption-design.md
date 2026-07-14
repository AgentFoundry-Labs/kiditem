# Develop UI 복원과 Sellpia·Channel 계약 이식 설계

## 목적

`origin/develop`의 `/inventory-hub`와 `/product-hub/matching` 화면 구조와 운영자 흐름을 복원한다. 데이터 소유권은 현재 `0.1.8` 재설계를 유지한다. Sellpia 재고는 물리 `MasterProduct`가 소유하고, 쇼핑몰 옵션 SKU는 `ChannelSkuComponent` 레시피로 하나 이상의 Sellpia 상품과 차감 수량을 명시한다.

복원은 레거시 데이터 모델이나 재고 수정 기능의 부활이 아니다. 화면의 정보 배치, 탭 구조, 요약 카드, 표 밀도, 모달 진입점을 `develop` 기준으로 되돌린 뒤 현재 NestJS API 계약을 연결하는 작업이다.

## 범위

### 포함

- `/inventory-hub`의 `develop`형 탭 순서, 헤더, 카드, 표, 운영 화면 배치
- `/product-hub/matching`의 `develop`형 헤더, 요약 카드, 상태 탭, 표, 작업 모달 배치
- Sellpia 엑셀 가져오기와 가져오기 이력
- 물리 `MasterProduct` 기준 현재 재고, 가격, 재고자산 표시
- ChannelAccount 선택, Coupang Wing 엑셀 가져오기, ChannelSku 검색과 상태 필터
- ChannelSku별 Sellpia 구성품 및 차감 수량의 전체 교체 저장
- 입출고·수불부·재고 실사·로켓 수동 처리 화면의 조회 또는 운영 기록 기능

### 제외

- legacy `channel-reconciliation` API와 `legacyCode` 자동 연결 규칙 복구
- `InventorySku`를 재고 원장으로 되돌리는 작업
- KidItem 화면에서 Sellpia 현재 재고를 직접 증감하는 기능
- 상품명, 옵션명 또는 번들 문구에서 차감 수량을 자동 추론하는 기능
- `/stock-ops`, 등록 상품, 수집 상품 등 다른 도메인의 시각 재설계

## 채택 방식

`develop UI 컴포넌트 복원 + 현재 API 계약 이식` 방식을 사용한다.

- `develop`의 화면 계층과 표현 컴포넌트를 기준으로 복원한다.
- 현재 브랜치의 React Query 훅, API 헬퍼, shared schema를 데이터 경계로 유지한다.
- 레거시 훅과 API를 되살리지 않고, 복원된 표현 컴포넌트가 현재 페이지 모델을 받도록 조정한다.
- 화면 전용 변환은 순수 page-model 함수로 분리해 테스트한다.

CSS만 비슷하게 만드는 방식은 조작 흐름이 달라지는 문제를 해결하지 못한다. `develop` 코드를 통째로 되돌리는 방식은 폐기된 재고 수정 및 reconciliation 계약을 부활시키므로 사용하지 않는다.

## 재고관리 설계

### 화면 구조

상단 탭의 순서와 시각적 배치는 `develop`을 기준으로 한다.

1. 재고 현황
2. 발주 관리
3. 입출고
4. Sellpia 동기화
5. 로켓 수동 처리
6. 수불부
7. 재고 실사
8. 재고자산

`재고 현황`은 `develop`의 요약 카드와 고밀도 표를 유지한다. 표의 데이터는 `/api/inventory/sellpia-skus`가 반환하는 물리 Sellpia `MasterProduct` 스냅샷이다. 기본 열은 상품명, 옵션, Sellpia 코드, 바코드, 현재고, 매입가, 판매가, 재고자산, 최종 가져오기 시각이다.

`입고`, `출고`, `조정`처럼 Sellpia 현재고를 직접 변경하던 액션은 복구하지 않는다. 같은 위치가 필요한 경우 조회 또는 운영 기록 작성 진입점으로 사용하며, 완료 결과도 `MasterProduct.currentStock`을 변경하지 않는다.

`Sellpia 동기화`는 현재의 파일 선택, 미리보기, 확정 가져오기, 중복 파일 처리 계약을 사용한다. 같은 탭 안에서 최근 가져오기 이력을 확인할 수 있게 하여 별도 상위 탭을 추가하지 않는다.

`채널 가용재고`는 별도 상위 탭으로 화면 구조를 확장하지 않는다. 재고 현황의 요약 또는 행 상세 진입점에서 현재 `/api/channels/sku-availability` 결과를 표시한다. 가용재고와 병목은 백엔드 계산값만 표시한다.

### 데이터 흐름

```text
Sellpia Excel
  -> POST /api/inventory/sellpia-sync/*
  -> physical MasterProduct snapshot
  -> GET /api/inventory/sellpia-skus
  -> develop-style inventory cards/table

ChannelSkuComponent recipes
  -> GET /api/channels/sku-availability
  -> inventory summary/detail read-only capacity
```

가져오기 성공 시 재고 스냅샷, 이력, 재고자산, 채널 가용재고 query family를 모두 무효화한다.

## 상품매칭 설계

### 화면 구조

`develop`의 화면 계층을 복원한다.

- 좌측: 제목과 한 줄 설명
- 우측: 마지막 상태 정보, 새로고침, Coupang Wing 엑셀 가져오기
- 요약 카드: 전체, 미매칭, 확인 필요, 매칭 완료
- 상태 탭과 서버 페이지네이션 표
- 표의 작업 버튼에서 Sellpia 구성 편집 모달 진입

기존 `자동 연결`, `충돌`, `제외` 상태는 현재 계약에 존재하지 않으므로 가짜 값을 만들지 않는다. 카드와 탭의 모양은 유지하되 현재 상태 집합인 `all`, `unmatched`, `needsReview`, `matched`만 표시한다.

표는 `develop`의 밀도와 구획을 따르며 다음 정보를 현재 Channel SKU 계약에서 읽는다.

- 채널 계정
- 채널 상품명과 외부 상품 ID
- 옵션명, 외부 SKU ID, seller SKU
- 바코드와 모델번호
- 판매 상태와 가격 메타데이터
- 저장된 Sellpia 구성품과 각 차감 수량
- 매칭 상태와 구성 편집 작업

구성 편집 모달은 현재 완전 교체 레시피 계약을 유지한다. 하나 이상의 서로 다른 `MasterProduct`와 양의 정수 수량만 저장할 수 있다. 명시적인 매칭 해제만 빈 구성 배열을 전송한다.

### 데이터 흐름

```text
Coupang Wing workbook
  -> ChannelAccount scoped catalog import
  -> ChannelListing / ChannelSku metadata
  -> server-paged mapping queue

operator edits recipe
  -> candidate search over physical Sellpia MasterProduct
  -> PUT /api/channels/sku-mappings/:channelSkuId/components
  -> ChannelSkuComponent replacement
  -> mapping list + channel availability invalidation
```

상품명, 옵션명, 바코드, 가격은 후보 탐색을 돕는 메타데이터다. 실제 매칭 기준은 저장된 `ChannelSkuComponent` 레시피뿐이다.

## 오류와 빈 상태

- API 오류는 `friendlyError`와 `sonner`를 사용한다.
- 채널 계정이 없으면 업로드와 상태 새로고침을 비활성화하고 계정 설정 안내를 표시한다.
- Sellpia 가져오기 실패는 기존 완료 스냅샷을 유지한다.
- 상태 새로고침 실패는 목록을 숨기지 않고 오래된 상태일 수 있음을 경고한다.
- 검색 또는 필터 결과가 없을 때와 아직 가져온 데이터가 없을 때의 문구를 구분한다.
- UI는 가용재고나 번들 수량을 자체 계산하지 않는다.

## 테스트 전략

TDD로 각 복원 단위를 진행한다.

1. `/inventory-hub`가 `develop` 기준 탭 순서와 레이블을 노출하는 테스트를 먼저 실패시킨다.
2. Sellpia 동기화 탭이 가져오기와 이력을 함께 노출하고 직접 재고 수정 액션을 제공하지 않는 테스트를 추가한다.
3. 재고 표 page-model이 MasterProduct 스냅샷을 `develop`형 행으로 변환하는 테스트를 추가한다.
4. `/product-hub/matching`이 요약 카드, 상태 탭, 계정 선택, 검색, Wing 업로드, 구성 편집 진입점을 `develop`형 구조로 노출하는 테스트를 먼저 실패시킨다.
5. 현재 ChannelSku 상태와 구성품 데이터가 복원된 표에 표시되는 테스트를 추가한다.
6. 기존 Sellpia import, ChannelSku 구성 전체 교체, 매칭 해제, query invalidation 테스트를 유지한다.
7. 관련 Vitest, 전체 web Vitest, `npm run build --workspace=apps/web`을 실행한다.
8. Chrome의 staging과 인앱 브라우저의 local을 같은 화면 크기로 비교해 탭 순서, 카드 배치, 표 밀도, 모달 진입점을 확인한다.

## 완료 기준

- 두 화면이 공통 앱 셸뿐 아니라 본문 계층과 운영 흐름도 `develop`과 일치한다.
- 데이터는 현재 Sellpia MasterProduct 및 Channel SKU API에서만 온다.
- KidItem UI에서 현재 재고를 직접 수정할 수 없다.
- Channel SKU 하나가 여러 Sellpia 상품과 각 수량을 저장할 수 있다.
- 관련 자동 테스트와 web 프로덕션 빌드가 통과한다.
- 브라우저 비교에서 불필요한 레이아웃 이탈이 없다.
