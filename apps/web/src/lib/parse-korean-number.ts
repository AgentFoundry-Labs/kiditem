/**
 * 한국어 숫자 파서 — "108.9만원" → 1089000, "1.2억" → 120000000
 * 만/억 단위 + K/M/B 영문 단위 + 일반 콤마 숫자 모두 지원
 */
export function parseKoreanNumber(val: string | null | undefined): number {
  if (!val) return 0;
  const s = String(val).trim();

  // 이미 순수 숫자면 그대로 반환
  if (/^\d+(\.\d+)?$/.test(s)) return parseFloat(s) || 0;

  // "억" 단위: "1.2억", "1억 2000만"
  const eokMatch = s.match(/([\d,.]+)\s*억/);
  if (eokMatch) {
    const base = parseFloat(eokMatch[1].replace(/,/g, "")) || 0;
    const manMatch = s.match(/억\s*([\d,.]+)\s*만/);
    const manPart = manMatch ? (parseFloat(manMatch[1].replace(/,/g, "")) || 0) * 10000 : 0;
    return Math.round(base * 100000000 + manPart);
  }

  // "만" 단위: "108.9만"
  const manMatch = s.match(/([\d,.]+)\s*만/);
  if (manMatch) {
    const base = parseFloat(manMatch[1].replace(/,/g, "")) || 0;
    return Math.round(base * 10000);
  }

  // K/M/B 영문 단위
  const kmMatch = s.match(/([\d,.]+)\s*([KMB])/i);
  if (kmMatch) {
    const base = parseFloat(kmMatch[1].replace(/,/g, "")) || 0;
    const unit = kmMatch[2].toUpperCase();
    if (unit === "B") return Math.round(base * 1000000000);
    if (unit === "M") return Math.round(base * 1000000);
    if (unit === "K") return Math.round(base * 1000);
  }

  // 일반 숫자: "1,234,567" → 1234567
  const num = parseFloat(s.replace(/[^\d.]/g, ""));
  return num || 0;
}
