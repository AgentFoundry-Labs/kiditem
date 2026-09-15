/**
 * 몰 카드 순서 조작 — 순수 함수.
 *
 * 화면(드래그·화살표)과 저장 요청이 같은 규칙을 쓰도록 여기 한 곳에 둔다.
 */

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
