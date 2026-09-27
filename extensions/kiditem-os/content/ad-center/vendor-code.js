// 광고센터 화면의 업체코드(KID-371). `TabPage.frames`가 이 파일을 넣고 마지막 식 값을 받는다(인자 없음, 읽기만).
// 옛 광고 수집(`content/coupang/ads-report.js` observedKeywordAdvertiser)과 같은 규칙: "업체코드" dt 다음 칸.
(() => {
  const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const term = [...document.querySelectorAll('dt')].find((candidate) => normalize(candidate.textContent) === '업체코드');
  const value = normalize(term?.nextElementSibling?.textContent);
  return { vendorId: value || null };
})();
