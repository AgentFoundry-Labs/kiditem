/**
 * Sellpia SKU 이름 조인 키.
 *
 * Inventory 의 `findByNormalizedNames` 는 DB 에서 이 술어로 비교한다:
 *
 * ```sql
 * regexp_replace(lower(normalize(name, NFKC)), '[[:space:]]+', '', 'g')
 * ```
 *
 * 즉 NFKC 정규화 → 소문자 → 모든 공백 제거. 그게 전부다.
 *
 * 선행 가격 숫자, 판매단위 꼬리표(`10개입`), 괄호, 특수문자는 **제거하지 않는다**.
 * 여기서 규칙을 넓히면 DB 술어와 어긋나 조회가 조용히 0건이 된다. 더 느슨한
 * 매칭이 필요하다면 그것은 별도의 명시적 정책이지 이 조인 키가 아니다.
 */
export function sellpiaNameJoinKey(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const key = value.normalize('NFKC').toLocaleLowerCase().replace(/\s/gu, '');
  return key.length > 0 ? key : null;
}
