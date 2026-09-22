/**
 * 몰 매장의 상품 페이지 주소 — 등록현황 칸에서 그 상품을 몰에서 바로 열어 본다(사장님 2026-09-19 "상품 url 로 가게도
 * 링크 하나 해야겠다").
 *
 * 우리가 확인한 규칙만 적는다(2026-09-19, 공개 상품 페이지를 열어 그 상품이 보이는지 봤다 — 지마켓 · 옥션 · 쿠팡은 로봇
 * 요청을 막아 브라우저로 열어 봤다: 빙글빙글프로펠라가 세 몰 모두 그대로 떴다). 모르는 몰은 null 이다 — 추측한 주소로
 * 링크하지 않는다. 카카오 톡스토어 · 스마트스토어는 주소에 스토어 이름이 들고, 키즈노트는 상품번호가 아니라 해시로
 * 열려 아직 없다.
 */
type ProductUrlRule = (code: string, storefrontProductId: string | null) => string | null;

/** 사방넷이 준 ESM 상품코드는 `{사이트상품번호}_{마스터상품번호}` 다(옛 옥션은 뒷자리가 없다). */
function esmSiteNo(code: string): string {
  return code.split('_')[0] ?? '';
}

const RULES: Readonly<Record<string, ProductUrlRule>> = {
  // 쿠팡 매장 상품번호(productId)는 윙 등록상품ID와 다르다 — 가져올 때 받은 값이 있을 때만.
  coupang: (_code, storefront) => (storefront && /^\d{1,15}$/.test(storefront)
    ? `https://www.coupang.com/vp/products/${storefront}`
    : null),
  gmarket: (code) => (/^\d{6,12}$/.test(esmSiteNo(code)) ? `https://item.gmarket.co.kr/Item?goodscode=${esmSiteNo(code)}` : null),
  auction: (code) => (/^[A-Z]\d{6,12}$/.test(esmSiteNo(code))
    ? `https://itempage3.auction.co.kr/DetailView.aspx?itemno=${esmSiteNo(code)}`
    : null),
  '11st': (code) => (/^\d{6,12}$/.test(code) ? `https://www.11st.co.kr/products/${code}` : null),
  'lotte-on': (code) => (/^LO\d{4,20}$/.test(code) ? `https://www.lotteon.com/p/product/${code}` : null),
  domeggook: (code) => (/^\d{1,12}$/.test(code) ? `https://domeggook.com/${code}` : null),
  'teacher-mall': (code) => (/^\d{1,12}$/.test(code) ? `https://shop.teacherville.co.kr/goods/view?no=${code}` : null),
  kkomangse: (code) => (/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(code)
    ? `https://nstore.edupre.co.kr/?pn=product.view&pcode=${code}`
    : null),
  'icecream-mall': (code) => (/^\d{1,15}$/.test(code) ? `https://www.i-screammall.co.kr/goods/detail/${code}` : null),
  kidkids: (code) => (/^\d{1,10}$/.test(code) ? `https://mall.kidkids.net/html/product.htm?gc=${code}` : null),
  art09: (code) => (/^\d{1,12}$/.test(code) ? `https://art09.co.kr/product/detail.html?product_no=${code}` : null),
  // 떠리몰(샵바이) 매장은 상품번호(mallProductNo)를 `detail?id=` 로 연다(2026-09-19 브라우저로 확인).
  thirtymall: (code) => (/^\d{6,12}$/.test(code) ? `https://thirtymall.com/detail?id=${code}` : null),
};

export function mallProductUrl(
  mallKey: string,
  externalId: string | null,
  storefrontProductId: string | null = null,
): string | null {
  const code = String(externalId ?? '').trim();
  const rule = RULES[mallKey];
  if (!rule || !code) return null;
  return rule(code, storefrontProductId);
}
