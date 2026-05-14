function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

export function buildSizeGuideFrameHtml(input: {
  src: string;
  alt: string;
  heightLabel?: string;
  widthLabel?: string;
}): string {
  const src = escapeAttr(input.src);
  const alt = escapeAttr(input.alt);
  const heightLabel = escapeHtml((input.heightLabel ?? '').trim());
  const widthLabel = escapeHtml((input.widthLabel ?? '').trim());
  const hasHeightGuide = heightLabel !== '';
  const hasWidthGuide = widthLabel !== '';
  const imageColumn = hasHeightGuide ? 2 : 1;
  const gridColumns = hasHeightGuide ? '82px minmax(0, max-content)' : 'minmax(0, max-content)';
  const gridRows = hasWidthGuide ? 'auto 78px' : 'auto';
  const heightGuide = hasHeightGuide ? `
        <div aria-hidden="true" style="position:relative;grid-column:1;grid-row:1;align-self:stretch;width:82px;min-height:330px;">
          <span style="position:absolute;top:0;bottom:0;right:8px;width:1.5px;background:#111827;">
            <span style="position:absolute;top:0;left:-13px;width:28px;height:1.5px;background:#111827;display:block;"></span>
            <span style="position:absolute;bottom:0;left:-13px;width:28px;height:1.5px;background:#111827;display:block;"></span>
          </span>
          <span data-field="sizeHeightLabel" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-90deg);transform-origin:center;color:#111827;font-size:42px;line-height:1;font-weight:900;white-space:nowrap;">${heightLabel}</span>
        </div>` : '';
  const widthGuide = hasWidthGuide ? `
        <div aria-hidden="true" style="position:relative;grid-column:${imageColumn};grid-row:2;align-self:start;width:100%;min-width:180px;height:72px;margin-top:18px;">
          <span style="position:absolute;left:0;right:0;top:0;height:1.5px;background:#111827;">
            <span style="position:absolute;left:0;top:-13px;width:1.5px;height:28px;background:#111827;display:block;"></span>
            <span style="position:absolute;right:0;top:-13px;width:1.5px;height:28px;background:#111827;display:block;"></span>
          </span>
          <span data-field="sizeWidthLabel" style="position:absolute;left:50%;top:18px;transform:translateX(-50%);color:#111827;font-size:46px;line-height:1;font-weight:900;white-space:nowrap;">${widthLabel}</span>
        </div>` : '';

  return `
    <div data-role="size-guide-frame" style="border-radius:34px;background:#fff;border:1px solid #f1f1f1;box-shadow:0 8px 24px rgba(15,23,42,.08);overflow:hidden;padding:48px 30px 38px;">
      <div style="min-height:520px;display:grid;place-items:center;">
        <div style="display:inline-grid;grid-template-columns:${gridColumns};grid-template-rows:${gridRows};column-gap:${hasHeightGuide ? 22 : 0}px;align-items:stretch;justify-content:center;justify-items:center;max-width:100%;">
          ${heightGuide}
          <img data-field="sizeGuideImage" src="${src}" alt="${alt}" style="grid-column:${imageColumn};grid-row:1;position:relative;z-index:10;display:block;width:auto;max-width:${hasHeightGuide ? 430 : 540}px;max-height:500px;object-fit:contain;" />
          ${widthGuide}
        </div>
      </div>
    </div>
  `;
}
