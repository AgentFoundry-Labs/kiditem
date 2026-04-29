/**
 * 썸네일 "배치 (Layout) 프리셋" — 합성 구도가 필요한 썸네일(여러 낱개 / 세트 / 색상별)에
 * 적용할 강한 배치 지시.
 *
 * `thumbnail-prompts.ts` 의 GENERATE_PROMPT 안 `{layoutBlock}` 자리에 override 주입된다.
 * `auto` 는 빈 문자열 → 모델 자율 판단(기존 동작과 동일).
 *
 * Phase 1: `auto` / `fan` / `grid` 세 개만 실제 프롬프트 블록을 제공. 나머지(`arch` / `stack`
 * / `radial`) 는 UI disable + 빈 블록으로 두고, 첫 데이터를 본 뒤 Phase 2 에서 튜닝한다.
 */

type LayoutKind = 'auto' | 'fan' | 'arch' | 'grid' | 'stack' | 'radial';

const PRESETS: Record<LayoutKind, string> = {
  auto: '',

  fan: `## Layout arrangement — Fan (부채꼴)
Arrange the pieces in a fan-shaped layout.
- Use the bottom-center of the frame as the implicit pivot point.
- Spread the pieces radially over a ~140° arc (bottom half), so the fan opens upward.
- Give each successive piece an equal angular rotation from the previous one, producing a symmetric fan silhouette.
- Tips of adjacent pieces may touch or overlap by at most ~10%, but each piece must remain individually identifiable at 200px.
- Maintain uniform spacing between pieces — no random gaps, no drifting.
- If a box or outer package is also provided, place it behind the fan, centered, as a backdrop. The fan sits in front.
- Do not invent extra pieces; use exactly the number of inputs provided.`,

  grid: `## Layout arrangement — Grid
Arrange the pieces on a clean orthogonal grid.
- Choose rows/columns to fit all pieces compactly (e.g. 10 → 2×5 or 5×2; 6 → 2×3; 9 → 3×3).
- Equal horizontal and vertical spacing between tiles; the whole grid is centered in the frame.
- All pieces face the camera at the same angle — no per-piece rotation, no perspective variance.
- Uniform lighting across every cell; no piece should sit in relative shadow.
- If a box or outer package is also provided, place it behind the grid, centered, as a backdrop.
- Do not invent extra pieces; use exactly the number of inputs provided.`,

  arch: '',
  stack: '',
  radial: '',
};

export function buildLayoutBlock(layout: LayoutKind | string | null | undefined): string {
  if (!layout) return '';
  const key = layout as LayoutKind;
  return PRESETS[key] ?? '';
}
