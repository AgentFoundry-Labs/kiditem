export type TemplateSectionKind =
  | 'size'
  | 'color'
  | 'usage'
  | 'detail'
  | 'safety'
  | 'hook';

export const TEMPLATE_SECTION_PRESETS: Array<{
  kind: TemplateSectionKind;
  label: string;
  sub: string;
}> = [
  { kind: 'size', label: '사이즈 섹션', sub: '제품 사이즈 및 구성품' },
  { kind: 'color', label: '색상 섹션', sub: '색상 안내 이미지' },
  { kind: 'usage', label: '사용법 섹션', sub: '글 1개 + 이미지 1개' },
  { kind: 'detail', label: '디테일컷 섹션', sub: 'DETAIL 이미지' },
  { kind: 'safety', label: '제품안전 표시', sub: '표시사항 / 바코드' },
  { kind: 'hook', label: '후킹 배너', sub: '광고 문구 카드' },
];

export function buildTemplateSectionBlockHtml(kind: TemplateSectionKind): string {
  switch (kind) {
    case 'size':
      return `<div data-section="sizeImages" style="margin:64px auto;text-align:center;">
  <div style="display:inline-block;background:#1e2d4d;color:white;border-radius:999px;padding:10px 42px;font-weight:900;font-size:20px;box-shadow:0 8px 18px rgba(15,23,42,.16);">제품 사이즈 및 구성품</div>
  <p style="margin:24px 0 0;color:#4b5563;font-size:18px;font-weight:800;">제품 사이즈 및 구성품 안내 입니다.</p>
  <div data-container="sizeImages" style="margin:34px auto 0;max-width:680px;padding:0 24px;">
    <div style="border-radius:32px;background:#fff;border:1px solid #f1f5f9;box-shadow:0 8px 24px rgba(15,23,42,.08);padding:40px;">
      <img data-field="sizeGuideImage" src="https://placehold.co/860x540/f8fafc/94a3b8?text=%EC%82%AC%EC%9D%B4%EC%A6%88+%EC%9D%B4%EB%AF%B8%EC%A7%80" alt="사이즈 안내" style="display:block;width:100%;height:auto;border-radius:22px;object-fit:contain;" />
    </div>
  </div>
</div>`;
    case 'color':
      return `<div data-section="colorImages" style="margin:64px auto;text-align:center;">
  <div style="width:320px;height:2px;background:#111827;opacity:.25;margin:0 auto 34px;"></div>
  <div style="display:inline-block;background:#1e2d4d;color:white;border-radius:999px;padding:9px 42px;font-weight:900;font-size:19px;box-shadow:0 8px 18px rgba(15,23,42,.16);">색상 안내</div>
  <p style="margin:22px 0 0;color:#6b7280;font-size:17px;font-weight:800;">색상 옵션을 입력하세요.</p>
  <div data-container="colorImages" style="margin:34px auto 0;max-width:680px;padding:0 24px;">
    <img src="https://placehold.co/860x520/f8fafc/94a3b8?text=%EC%83%89%EC%83%81+%EC%9D%B4%EB%AF%B8%EC%A7%80" alt="색상 안내" style="display:block;width:100%;height:auto;border-radius:32px;box-shadow:0 8px 22px rgba(15,23,42,.10);" />
  </div>
</div>`;
    case 'usage':
      return `<div data-section="usageImages" style="margin:64px auto;text-align:center;">
  <div style="width:320px;height:2px;background:#111827;opacity:.25;margin:0 auto 34px;"></div>
  <div style="display:inline-block;background:#1e2d4d;color:white;border-radius:999px;padding:9px 42px;font-weight:900;font-size:19px;box-shadow:0 8px 18px rgba(15,23,42,.16);">사용법 안내</div>
  <div data-container="usageImages" style="margin:34px auto 0;max-width:680px;padding:0 24px;display:flex;flex-direction:column;gap:22px;">
    <div style="overflow:hidden;border:1px solid #eef2f7;border-radius:26px;background:white;box-shadow:0 6px 18px rgba(15,23,42,.06);text-align:left;">
      <div style="display:flex;align-items:center;gap:14px;padding:18px 22px;color:#111827;font-size:18px;font-weight:900;">
        <span style="display:inline-flex;width:34px;height:34px;align-items:center;justify-content:center;border-radius:999px;background:#1e2d4d;color:white;">1</span>
        사용 방법을 입력하세요.
      </div>
      <img src="https://placehold.co/860x520/f8fafc/94a3b8?text=%EC%82%AC%EC%9A%A9%EB%B2%95+%EC%9D%B4%EB%AF%B8%EC%A7%80" alt="사용법 이미지" style="display:block;width:100%;height:auto;object-fit:cover;" />
    </div>
  </div>
</div>`;
    case 'detail':
      return `<div data-section="detailImages" style="margin:64px auto;text-align:center;">
  <div style="width:320px;height:2px;background:#111827;opacity:.25;margin:0 auto 34px;"></div>
  <div style="display:inline-block;background:#1e2d4d;color:white;border-radius:999px;padding:9px 42px;font-weight:900;font-size:19px;box-shadow:0 8px 18px rgba(15,23,42,.16);">DETAIL</div>
  <div data-container="detailImages" style="margin:34px auto 0;max-width:680px;padding:0 24px;display:flex;flex-direction:column;gap:22px;">
    <img src="https://placehold.co/860x560/f8fafc/94a3b8?text=DETAIL+IMAGE" alt="디테일 이미지" style="display:block;width:100%;height:auto;border-radius:32px;box-shadow:0 8px 22px rgba(15,23,42,.10);" />
  </div>
</div>`;
    case 'safety':
      return `<section data-section="specs" style="margin:64px auto;padding:56px 24px;background:#fff8ec;text-align:center;">
  <div style="display:inline-block;background:#1e2d4d;color:white;border-radius:999px;padding:9px 42px;font-weight:900;font-size:19px;box-shadow:0 8px 18px rgba(15,23,42,.16);">INFO</div>
  <div data-container="safetyLabelImages" style="margin:34px auto 0;max-width:680px;">
    <img src="https://placehold.co/860x420/ffffff/94a3b8?text=%EC%A0%9C%ED%92%88%EC%95%88%EC%A0%84+%ED%91%9C%EC%8B%9C" alt="제품안전 표시" style="display:block;width:100%;height:auto;border-radius:24px;border:10px solid #9aa9d4;background:white;" />
  </div>
</section>`;
    case 'hook':
      return `<div data-section="hookAds" style="margin:64px auto;max-width:560px;padding:0 24px;display:flex;flex-direction:column;gap:16px;">
  <div style="border-radius:16px;background:#14233f;color:white;padding:26px;text-align:center;box-shadow:0 8px 18px rgba(15,23,42,.14);">
    <div style="font-size:24px;font-weight:900;">후킹 배너</div>
    <div style="margin-top:10px;color:#cbd5e1;font-size:15px;font-weight:700;">광고 문구를 입력하세요.</div>
  </div>
</div>`;
  }
}
