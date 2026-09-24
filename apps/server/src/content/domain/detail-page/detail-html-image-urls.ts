/**
 * 상세 HTML 안의 사진 참조(`img`/`source` 의 `src` · `srcset`)만 바꿔 쓴다 — 순수 함수(KID-319).
 *
 * 가져온 상세의 원천 사진(사방넷 서버)을 우리 저장소로 옮긴 뒤 revision 을 고칠 때 쓴다. 바꿀 표는 원래 주소 →
 * 새 주소이고, 열쇠는 정규화한 주소(`//` 는 `https:`, `URL.href`)다. 글자로 적힌 주소는 건드리지 않는다.
 */
export function rewriteDetailHtmlImageUrls(
  html: string,
  replacements: ReadonlyMap<string, string>,
): { html: string; changed: boolean } {
  let changed = false;
  const rewritten = html.replace(/<(?:img|source)\b[^>]*>/gi, (tag) => tag.replace(
    /(\s(?:src|srcset)\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (attribute, prefix: string, doubleQuoted?: string, singleQuoted?: string, bare?: string) => {
      const value = doubleQuoted ?? singleQuoted ?? bare ?? '';
      const next = value.replace(/[^\s,]+/g, (candidate) => {
        const replacement = replacementFor(candidate, replacements);
        if (!replacement) return candidate;
        changed = true;
        return replacement;
      });
      if (next === value) return attribute;
      const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
      return `${prefix}${quote}${next}${quote}`;
    },
  ));
  return { html: rewritten, changed };
}

/** 사진 주소 목록의 바꿀 것만 바꾼다. */
export function rewriteImageUrlList(
  urls: readonly string[],
  replacements: ReadonlyMap<string, string>,
): string[] {
  return urls.map((url) => replacementFor(url, replacements) ?? url);
}

function replacementFor(raw: string, replacements: ReadonlyMap<string, string>): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  return replacements.get(canonical(trimmed) ?? trimmed) ?? replacements.get(trimmed) ?? null;
}

function canonical(url: string): string | null {
  try {
    return new URL(url.startsWith('//') ? `https:${url}` : url).href;
  } catch {
    return null;
  }
}
