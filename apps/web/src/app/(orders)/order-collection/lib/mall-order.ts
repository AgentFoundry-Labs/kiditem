/**
 * 몰 카드 순서 조작 — 순수 함수.
 *
 * 화면(드래그·화살표)과 저장 요청이 같은 규칙을 쓰도록 여기 한 곳에 둔다.
 */

/**
 * 순서를 저장할 수 있는 몰인가 — 계정 행이 있는 몰뿐이다.
 *
 * 순서는 몰 계정 행에 담긴다. 행이 없는 몰은 미설정이라(ADR-0012) 서버가 순서를 담으려고
 * 행을 만들지 않고, 그 몰은 카탈로그 순서로 뒤에 선다. 목록 응답의 `updatedAt` 은 행이
 * 없을 때만 비어 있다.
 */
export function hasMallAccountRow(account: { updatedAt: string | null }): boolean {
  return account.updatedAt !== null;
}

/** `mallKey` 를 한 칸 앞(-1)이나 뒤(+1)로 옮긴다. 끝을 넘어가면 그대로 둔다. */
export function moveMallKey(
  keys: readonly string[],
  mallKey: string,
  direction: -1 | 1,
): string[] {
  const from = keys.indexOf(mallKey);
  if (from < 0) return [...keys];
  const to = from + direction;
  if (to < 0 || to >= keys.length) return [...keys];
  const next = [...keys];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  return next;
}

/** 드래그한 몰(`sourceKey`)을 놓은 자리(`targetKey`) 위치로 끼워 넣는다. */
export function reorderMallKeys(
  keys: readonly string[],
  sourceKey: string,
  targetKey: string,
): string[] {
  if (sourceKey === targetKey) return [...keys];
  const from = keys.indexOf(sourceKey);
  const to = keys.indexOf(targetKey);
  if (from < 0 || to < 0) return [...keys];
  const next = [...keys];
  next.splice(to, 0, next.splice(from, 1)[0]!);
  return next;
}
