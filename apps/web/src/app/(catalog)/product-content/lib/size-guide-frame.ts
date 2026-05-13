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
  const gridColumns = hasHeightGuide ? '52px minmax(0, max-content) 52px' : 'minmax(0, max-content)';
  const gridRows = hasWidthGuide ? 'auto 58px' : 'auto';
  const heightGuide = hasHeightGuide ? `
        <div aria-hidden="true" style="position:relative;grid-column:1;grid-row:1;align-self:stretch;width:60px;">
          <span style="position:absolute;top:0;bottom:0;right:8px;width:1.25px;background:#111827;">
            <span style="position:absolute;top:0;left:-10px;width:22px;height:1.25px;background:#111827;display:block;"></span>
            <span style="position:absolute;bottom:0;left:-10px;width:22px;height:1.25px;background:#111827;display:block;"></span>
          </span>
          <span data-field="sizeHeightLabel" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-90deg);transform-origin:center;color:#111827;font-size:34px;line-height:1;font-weight:900;white-space:nowrap;">${heightLabel}</span>
        </div>` : '';
  const widthGuide = hasWidthGuide ? `
        <div aria-hidden="true" style="position:relative;grid-column:${imageColumn};grid-row:2;align-self:start;width:100%;min-width:180px;height:54px;margin-top:14px;">
          <span style="position:absolute;left:0;right:0;top:0;height:1.25px;background:#111827;">
            <span style="position:absolute;left:0;top:-10px;width:1.25px;height:22px;background:#111827;display:block;"></span>
            <span style="position:absolute;right:0;top:-10px;width:1.25px;height:22px;background:#111827;display:block;"></span>
          </span>
          <span data-field="sizeWidthLabel" style="position:absolute;left:50%;top:14px;transform:translateX(-50%);color:#111827;font-size:34px;line-height:1;font-weight:900;white-space:nowrap;">${widthLabel}</span>
        </div>` : '';

  return `
    <div data-role="size-guide-frame" style="border-radius:34px;background:#eaf6ff;border:1px solid #d8ebf7;box-shadow:none;overflow:hidden;padding:clamp(34px, 6vw, 62px) clamp(24px, 5vw, 48px) clamp(30px, 5vw, 48px);">
      <div style="display:grid;place-items:center;">
        <div style="display:inline-grid;grid-template-columns:${gridColumns};grid-template-rows:${gridRows};column-gap:${hasHeightGuide ? 10 : 0}px;align-items:stretch;justify-content:center;justify-items:center;max-width:100%;width:fit-content;">
          ${heightGuide}
          <img data-field="sizeGuideImage" src="${src}" alt="${alt}" style="grid-column:${imageColumn};grid-row:1;position:relative;z-index:10;display:block;width:auto;max-width:100%;max-height:430px;object-fit:contain;" />
          ${widthGuide}
        </div>
      </div>
    </div>
  `;
}
