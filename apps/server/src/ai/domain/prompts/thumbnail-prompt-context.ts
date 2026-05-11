/**
 * 상품명에서 quantity 추출 — 한국어/영문 빈출 패턴.
 * 예: "탐사 샘물 2L 12개" → 12, "지우개 8종 세트" → 8, "X 24팩" → 24, "5 pack" → 5.
 *
 * 매칭 룰 (위에서부터 우선):
 *  - "(N)개입" / "(N)개" (단 "N개월" 제외)
 *  - "(N)종" / "(N)가지" (set/variant 카탈로그)
 *  - "(N)팩" / "(N) pack" / "(N) ea" / "(N) BTL"
 *  - "x(N)" / "(N)x" (수량 곱셈 표기)
 *  - "(N)세트" / "(N)매" / "(N)병" / "(N)개세트"
 *
 * 안전 범위: 2 ≤ N ≤ 200. 이상치는 무시 (가격/용량 오인 방지).
 */
export function extractProductQuantity(name: string | null | undefined): number | null {
  if (!name) return null;
  const patterns: RegExp[] = [
    /(\d+)\s*개입/,
    /(\d+)\s*개(?!월)(?:\s*세트)?/, // "12개" / "12개세트", "12개월" 은 제외
    /(\d+)\s*종(?:\s*세트)?/, // "8종 세트"
    /(\d+)\s*가지/,
    /(\d+)\s*팩/,
    /(\d+)\s*pack/i,
    /(\d+)\s*ea\b/i,
    /(\d+)\s*btl\b/i,
    /\bx\s*(\d+)\b/i,
    /\b(\d+)\s*x\b/i,
    /(\d+)\s*세트/,
    /(\d+)\s*매/,
    /(\d+)\s*병/,
  ];
  for (const p of patterns) {
    const m = name.match(p);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 2 && n <= 200) return n;
    }
  }
  return null;
}

/**
 * editImage 시 상품명/카테고리 컨텍스트를 prompt 최상단에 박는 헬퍼.
 * AI 가 입력 이미지를 해석할 때 "이 제품이 무엇인지" 의 baseline 인식을 가지도록.
 * 예: 머리띠 상품인데 캐릭터 부착물만 보고 "캐릭터 세트" 로 오해해서 band loop 를
 * 떼버리는 실패를 차단.
 *
 * 추가로 상품명에서 quantity (N개) 가 검출되면 "PRODUCT QUANTITY: N" 룰을 박는다 →
 * AI 가 source 이미지의 visible item count 가 부족해도 N 개를 그리도록 강제.
 */
export function buildProductContextHeader(
  productName: string | null | undefined,
  category: string | null | undefined,
): string {
  const name = productName?.trim();
  const cat = category?.trim();
  if (!name && !cat) return '';
  const lines: string[] = ['## PRODUCT CONTEXT (read before interpreting the image)'];
  if (name) lines.push(`- Product name: "${name}"`);
  if (cat) lines.push(`- Category: ${cat}`);

  const qty = extractProductQuantity(name);
  if (qty !== null) {
    lines.push(
      `- **PRODUCT QUANTITY: ${qty}** — the listing explicitly states **${qty} units / pieces / variants** in its name. The output thumbnail MUST contain exactly ${qty} of the product (or ${qty} variants/items if it's a set/variant listing), regardless of how many appear in the source image. If the source shows fewer than ${qty} (e.g. only 6 bottles for a "12개" listing), GENERATE the missing units by replicating the visible unit's exact appearance — same shape, same color, same labels, same surface detail. If the source shows more than ${qty}, reduce the output to ${qty}. This quantity rule OVERRIDES any "use the same number of units visible in the source" instruction in the rest of the prompt.`,
    );
  }

  lines.push(
    '- Use this context to identify what kind of physical product the image represents (e.g. headband, hat, shoe, toy, package). The structural base of that product type (the part the user wears, holds, or operates) MUST appear in the output, not just its decorations.',
  );
  return `${lines.join('\n')}\n\n`;
}
