# 쿠팡 등록상품명 정규화 후보 매칭 설계

## 목적

쿠팡 Wing `등록상품명`과 Sellpia `MasterProduct.name`이 공백 차이만 있는 경우를 강한 매칭 후보로 노출하고, 저장된 구성품이 없는 Channel SKU의 advisory 상태를 `needs_review`로 올린다. 이름 후보는 `ChannelSkuComponent`를 생성하지 않으며 구성 수량도 추론하지 않는다.

이 변경은 Channels 상품매칭 도메인의 같은-domain cross-layer 계약 변경이다. shared 후보 사유, Channels 후보 산정과 상태 새로고침, Inventory 읽기 포트, 매칭 UI의 근거 레이블을 함께 변경한다. 데이터 모델, 재고 소유권, 라우트 형태는 바꾸지 않는다.

## 정규화 계약

엄격 정규화 키는 다음 순서로 만든다.

1. Unicode `NFKC` 정규화
2. 소문자화
3. 모든 Unicode 공백 제거

숫자와 `+`, `-`, `/`, `&`를 포함한 의미 있는 기호는 보존한다. 모든 문장부호를 제거하는 느슨한 키는 이번 범위에 포함하지 않는다. 승인 파일 분석에서 공백 제거는 기존 식별자 미매칭 SKU 2,086개 중 515개를 찾았고, 모든 기호 제거가 추가로 찾은 행은 2개뿐이므로 충돌 가능성을 늘릴 이유가 없다.

정규화 결과가 빈 문자열이면 이름 근거로 사용하지 않는다. 비교 대상은 쿠팡 `등록상품명`과 Sellpia `name`뿐이다. 쿠팡 노출상품명, 옵션명, 검색어는 기존 일반 제안 검색에는 남지만 정규화 완전일치 근거가 되지 않는다.

## 검토한 방식

### 1. 기존 `contains` 검색 재사용

구현은 가장 작지만 공백이 있는 등록상품명과 공백이 없는 Sellpia 상품명을 서로 찾지 못한다. 일반 이름 제안과 정규화 완전일치의 근거 강도도 구분할 수 없어 채택하지 않는다.

### 2. 모든 활성 MasterProduct를 애플리케이션으로 읽어 메모리 비교

스키마와 SQL을 바꾸지 않고 NFKC를 정확히 적용할 수 있다. 그러나 후보 모달을 열 때마다 최대 20,000개 Sellpia 행을 읽게 되므로 불필요한 전송과 메모리 비용이 발생한다.

### 3. Inventory의 전용 정규화 이름 조회 포트

이 방식을 채택한다. Channels는 정규화 키만 전달하고, Inventory repository가 organization과 active 조건을 포함한 Prisma tagged raw SQL로 같은 정규화 표현식을 적용한다. PostgreSQL `normalize(name, NFKC)`, `lower`, `regexp_replace(..., '[[:space:]]+', '', 'g')`를 사용한다. 스키마나 별도 정규화 컬럼 없이 현재 규모에서 한 번의 batch 조회로 후보를 얻는다.

향후 이름 조회량이 커져 실행 계획상 병목이 확인될 때에만 저장 정규화 키와 인덱스를 별도 설계한다.

## 계약과 데이터 흐름

shared 후보 사유에 `exact_normalized_name`을 추가한다. UI 레이블은 `등록상품명 일치`로 표시한다.

```text
Coupang registeredName
  -> Channels strict normalized-name key
  -> Inventory findByNormalizedNames(organizationId, keys)
  -> active physical MasterProduct rows
  -> candidate ranking reason exact_normalized_name
  -> advisory status needs_review (화면 문구: 확인 필요)
  -> no ChannelSkuComponent write
```

후보 순서는 다음 강도를 유지한다.

1. Sellpia 상품코드 일치
2. 고유 바코드
3. 중복 식별자
4. 정규화 등록상품명 일치
5. 일반 이름 제안
6. 운영자 검색 결과

한 정규화 이름이 여러 Sellpia 행에 일치하면 모든 행을 같은 근거로 노출한다. 이름 후보의 개수와 관계없이 자동 확정하지 않으므로 별도의 `ambiguous_normalized_name` 상태나 사유는 추가하지 않는다.

## 상태 변경 규칙

- 저장된 구성품이 없는 SKU만 상태 새로고침 대상이다.
- 기존 정확한 코드 또는 고유 바코드 자동 매칭이 성공하면 기존 동작대로 `matched`와 수량 1 구성품을 저장한다.
- 자동 식별자 매칭이 성공하지 않았고 정규화 등록상품명 후보가 하나 이상이면 `needs_review`(화면 문구: `확인 필요`)로 저장한다.
- 정규화 이름 후보만으로 `ChannelSkuComponent`를 만들거나 `quantity = 1`을 저장하지 않는다.
- 명시적 매칭 해제 후에도 정규화 이름 후보가 남아 있으면 advisory 상태는 `needs_review`로 돌아간다.
- 일반 `name_suggestion`과 수동 검색 결과만 있는 경우는 기존대로 `unmatched`다.

## 오류와 경계

- 이름 조회는 모든 쿼리에 `organizationId`와 `isActive = true`를 적용한다.
- 빈 키 배열은 DB를 호출하지 않고 빈 결과를 반환한다.
- 중복 키는 서비스 경계에서 제거한다.
- 조회 실패는 후보 또는 상태 새로고침 요청을 실패시킨다. 부분 후보로 상태를 낮춰 저장하지 않는다.
- Sellpia `currentStock`, 가격, import provenance는 읽기만 한다.
- 이름, 옵션 또는 묶음 문구에서 구성 수량을 계산하지 않는다.

## UI

매칭 모달은 `등록상품명 일치` 배지를 추가한다. 기존 안내 문구인 “후보는 자동 저장되지 않는다”와 구성 수량 편집 흐름은 유지한다. 이름 후보를 자동으로 draft에 추가하거나 저장하지 않는다.

## 테스트 전략

TDD 순서는 다음과 같다.

1. domain 테스트에서 NFKC, 대소문자, 공백을 정규화하고 의미 있는 기호를 보존하는 실패 테스트를 추가한다.
2. ranking 테스트에서 정확한 정규화 이름 후보가 일반 이름 제안보다 앞서며 `needs_review`를 만드는 실패 테스트를 추가한다.
3. Inventory repository/service 테스트에서 빈 입력 단락, organization/active 조건, 정규화 이름 batch 조회를 추가한다.
4. Channels service 테스트에서 후보 endpoint가 등록상품명 키를 조회하고, 상태 새로고침이 이름 후보를 구성품 없이 `needs_review`로 저장하는 실패 테스트를 추가한다.
5. shared schema 테스트에 새 후보 사유를 추가한다.
6. web dialog 테스트에서 새 근거 배지와 이름 후보 비자동저장을 확인한다.
7. focused shared/server/web 테스트 후 shared/server/web build와 Nest boot를 실행한다.

## 릴리스와 데이터

스키마 변경이나 backfill은 없다. `mappingStatus`는 상태 새로고침 시 재계산되는 advisory 값이며 저장된 구성 레시피는 변경하지 않는다. 현재 `0.1.18` 기능 작업 안의 additive 계약 변경으로 처리하므로 이 변경만으로 `VERSION`을 올리지 않는다.

## 완료 기준

- 공백 차이만 있는 등록상품명과 Sellpia 상품명이 `exact_normalized_name` 후보로 나타난다.
- 의미 있는 기호가 다른 이름은 완전일치 후보가 되지 않는다.
- 이름 후보가 있는 unmapped SKU는 `needs_review`가 되지만 구성품은 생성되지 않는다.
- 여러 Sellpia 옵션이 같은 이름을 가져도 자동 선택하지 않고 모두 후보로 표시한다.
- 기존 코드/바코드 자동 매칭, 일반 이름 제안, 수동 검색, 명시적 매칭 해제 동작이 유지된다.
- shared, backend, frontend 계약 테스트와 필수 빌드/부팅 검증이 통과한다.
