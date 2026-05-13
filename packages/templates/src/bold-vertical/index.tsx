/**
 * Bold Vertical template — React component.
 *
 * Converted from apps/backend/app/templates/bold_vertical.html + heroes/bold_v1.html.
 * Uses Tailwind CSS utility classes + CSS custom properties for theming.
 */
import type { CSSProperties } from 'react';
import type { DetailPageData } from '../types';

interface BoldVerticalProps {
  data: DetailPageData;
}

function getDisabledSections(d: DetailPageData): Set<string> {
  const disabled = new Set<string>();
  if (d.layout?.components) {
    for (const slot of d.layout.components) {
      if (!slot.enabled) disabled.add(slot.type);
    }
  }
  return disabled;
}

/** CSS custom properties for theme tokens. */
function themeVars(d: DetailPageData): CSSProperties {
  return {
    '--theme-main': d.themeColorMain,
    '--theme-bg-light': d.themeColorBgLight,
    '--theme-badge-1': d.themeColorBadge1,
    '--theme-badge-2': d.themeColorBadge2,
    '--theme-section-bg': d.themeSectionBg,
    '--theme-text-primary': d.themeTextPrimary,
    '--theme-text-secondary': d.themeTextSecondary,
    '--theme-radius': d.themeBorderRadius,
  } as CSSProperties;
}

function titleGradientTextStyle(): CSSProperties {
  return {
    backgroundImage: 'linear-gradient(90deg, var(--theme-badge-2) 0%, #596783 52%, var(--theme-badge-1) 100%)',
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    color: 'transparent',
  };
}

// ─── Hero Section (heroes/bold_v1.html) ─────────────────────────────────────

function HeroSection({ d }: { d: DetailPageData }) {
  const bannerSrc = d.heroBanner || '';
  const featureLines = d.description
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);
  const featureCopy = featureLines.join(' ');

  return (
    <section data-section="hero" className="bg-[var(--theme-bg-light)]">
      {bannerSrc && (
        <div className="w-full aspect-[21/9] relative overflow-hidden">
          <img
            data-field="heroBanner"
            src={bannerSrc}
            alt={d.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="text-center mt-16 px-4 flex flex-col items-center">
        {d.hookSubtext && (
          <p
            data-field="hookSubtext"
            className="mb-4 text-2xl md:text-3xl text-[var(--theme-text-primary)]"
            style={{
              fontFamily: 'NanumPen, cursive',
              transform: 'rotate(-4deg)',
              textUnderlineOffset: 5,
              textDecorationLine: 'underline',
              textDecorationColor: 'var(--theme-main)',
              textDecorationThickness: 2,
            }}
          >
            <span className="inline-block px-2 leading-none">
              {d.hookSubtext}
            </span>
          </p>
        )}
        <h1 className="font-display text-[80px] md:text-[96px] leading-[1.02]">
          <span
            data-field="hookText"
            style={{ ...titleGradientTextStyle(), fontWeight: 900 }}
          >
            {d.hookText}
          </span>
          {d.hookTitleSub && (
            <>
              <br />
              <span
                data-field="hookTitleSub"
                className="text-[#111827]"
                style={{ fontWeight: 900 }}
              >
                {d.hookTitleSub}
              </span>
            </>
          )}
        </h1>
        <div className="w-64 h-0.5 bg-[var(--theme-main)] opacity-40 mt-6" />

        <div data-field="description" className="mt-6 flex flex-col items-center gap-3 text-lg md:text-xl font-bold text-[var(--theme-text-primary)]">
          {featureCopy && (
            <p className="leading-relaxed">
              {featureCopy}
            </p>
          )}
          <p className="leading-relaxed text-[var(--theme-main)]">
            <span className="font-black">
              색상 및 디자인
            </span>
            <span>은 선택할 수 없으며 랜덤출고 됩니다.</span>
          </p>
          <p className="max-w-xl rounded-[var(--theme-radius)] bg-white/80 px-6 py-4 text-base md:text-lg leading-relaxed shadow-sm border border-white/80 text-[var(--theme-text-secondary)]">
            이미지와 제품의 구성품은 실제와 다를 수 있습니다
          </p>
        </div>
      </div>

      {d.images.length > 0 && (
        <div className="mt-16 h-[560px] w-full overflow-hidden bg-white md:h-[640px]">
          <img
            data-field="heroImage"
            src={d.images[0]}
            alt={d.title}
            className="block h-full w-full max-w-none object-cover"
            style={{
              display: 'block',
              width: '100%',
              maxWidth: 'none',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </div>
      )}
    </section>
  );
}

// ─── Sub-section badge ──────────────────────────────────────────────────────

function SubSectionBadge({ label }: { label: string }) {
  return (
    <div className="inline-block bg-[#1e2d4d] text-white rounded-full px-12 py-2 font-bold text-xl shadow-md">
      {label}
    </div>
  );
}

function productDisplayName(d: DetailPageData): string {
  return [d.hookText, d.hookTitleSub]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim() || d.title;
}

function productSentenceName(d: DetailPageData): string {
  return productDisplayName(d).replace(/[!?.]+$/g, '');
}

function usageGuideSteps(value: string): string[] {
  return value
    .split(/\n|(?:^|\s)(?=\d+[.)]\s*)/u)
    .map((line) => line.replace(/^\d+[.)]\s*/u, '').trim())
    .filter(Boolean)
    .slice(0, 3);
}

function SizeGuideSection({ d }: { d: DetailPageData }) {
  const [mainImage, ...restImages] = d.sizeImages;
  if (!mainImage) return null;
  const showHeightGuide = d.sizeGuideOverlay && d.sizeHeightLabel.trim() !== '';
  const showWidthGuide = d.sizeGuideOverlay && d.sizeWidthLabel.trim() !== '';
  const productName = productSentenceName(d);
  const sizeGuideLabelStyle: CSSProperties = {
    color: '#111827',
    fontSize: 'clamp(24px, 4vw, 34px)',
    lineHeight: 1,
    fontWeight: 900,
    whiteSpace: 'nowrap',
  };

  return (
    <div data-section="sizeImages">
      <div className="text-center mt-16 px-4">
        <SubSectionBadge label="제품 사이즈 및 구성품" />

        <p className="mt-6 text-[var(--theme-text-primary)] font-bold text-lg md:text-xl">
          {productName}의 사이즈 및 구성품 안내 입니다.
        </p>

        <div data-container="sizeImages" className="mt-10 max-w-2xl mx-auto">
          <div
            data-role="size-guide-frame"
            style={{
              borderRadius: 34,
              background: '#eaf6ff',
              border: '1px solid #d8ebf7',
              boxShadow: 'none',
              overflow: 'hidden',
              padding: 'clamp(34px, 6vw, 62px) clamp(24px, 5vw, 48px) clamp(30px, 5vw, 48px)',
            }}
          >
            <div
              style={{
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <div
                style={{
                  display: 'inline-grid',
                  gridTemplateColumns: showHeightGuide ? '52px minmax(0, max-content) 52px' : 'minmax(0, max-content)',
                  gridTemplateRows: showWidthGuide ? 'auto 58px' : 'auto',
                  columnGap: showHeightGuide ? 10 : 0,
                  alignItems: 'stretch',
                  justifyContent: 'center',
                  justifyItems: 'center',
                  maxWidth: '100%',
                  width: 'fit-content',
                }}
              >
                {showHeightGuide && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'relative',
                      gridColumn: 1,
                      gridRow: 1,
                      alignSelf: 'stretch',
                      width: 60,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        right: 8,
                        width: 1.25,
                        background: '#111827',
                      }}
                    >
                      <span style={sizeGuideCap('top')} />
                      <span style={sizeGuideCap('bottom')} />
                    </span>
                    <span
                      data-field="sizeHeightLabel"
                      style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%) rotate(-90deg)',
                        transformOrigin: 'center',
                        ...sizeGuideLabelStyle,
                      }}
                    >
                      {d.sizeHeightLabel}
                    </span>
                  </div>
                )}

                <img
                  data-field="sizeGuideImage"
                  src={mainImage}
                  alt="제품 사이즈"
                  style={{
                    gridColumn: showHeightGuide ? 2 : 1,
                    gridRow: 1,
                    position: 'relative',
                    zIndex: 10,
                    display: 'block',
                    width: 'auto',
                    maxWidth: '100%',
                    maxHeight: 430,
                    objectFit: 'contain',
                  }}
                />

                {showWidthGuide && (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'relative',
                      gridColumn: showHeightGuide ? 2 : 1,
                      gridRow: 2,
                      alignSelf: 'start',
                      width: '100%',
                      minWidth: 180,
                      height: 54,
                      marginTop: 14,
                    }}
                  >
                    <span
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: 0,
                        height: 1.25,
                        background: '#111827',
                      }}
                    >
                      <span style={sizeGuideCap('left')} />
                      <span style={sizeGuideCap('right')} />
                    </span>
                    <span
                      data-field="sizeWidthLabel"
                      style={{
                        position: 'absolute',
                        left: '50%',
                        top: 14,
                        transform: 'translateX(-50%)',
                        ...sizeGuideLabelStyle,
                      }}
                    >
                      {d.sizeWidthLabel}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {restImages.length > 0 && (
            <div className="mt-6 flex flex-col gap-6">
              {restImages.map((src, i) => (
                <img
                  key={i}
                  src={src}
                  alt="추가 사이즈 안내"
                  className="w-full h-auto rounded-[var(--theme-radius)]"
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function sizeGuideCap(position: 'top' | 'bottom' | 'left' | 'right'): CSSProperties {
  const isVerticalCap = position === 'top' || position === 'bottom';
  return {
    position: 'absolute',
    ...(position === 'top' ? { top: 0, left: -10 } : {}),
    ...(position === 'bottom' ? { bottom: 0, left: -10 } : {}),
    ...(position === 'left' ? { left: 0, top: -10 } : {}),
    ...(position === 'right' ? { right: 0, top: -10 } : {}),
    width: isVerticalCap ? 22 : 1.25,
    height: isVerticalCap ? 1.25 : 22,
    background: '#111827',
    content: '""',
    display: 'block',
  };
}

// ─── Point Section ──────────────────────────────────────────────────────────

function PointSection({ d }: { d: DetailPageData }) {
  const productName = productSentenceName(d);
  const hasColorSection = d.colorImages.length > 0 || d.colorSubtitle.trim() !== '';
  const usageSteps = usageGuideSteps(d.usageSubtitle);
  const hasUsageSection = d.usageImages.length > 0 || usageSteps.length > 0;
  const extraUsageImages = d.usageImages.slice(usageSteps.length);
  const sectionName = d.hookText || d.sectionName;
  const sectionTitle = d.hookTitleSub || d.sectionTitle;
  const packageSectionImages = uniqueImageUrls(d.detailPackageImages);
  const packageImageSet = new Set(packageSectionImages);
  const detailSectionImages = uniqueImageUrls(
    d.detailImages.length > 0 ? d.detailImages : d.images.slice(0, 1),
  ).filter((src) => !packageImageSet.has(src));
  const hasDetailSection = detailSectionImages.length > 0 || packageSectionImages.length > 0;

  return (
    <section data-section="point" className="bg-white pb-20 pt-28 relative">
      <div className="absolute left-1/2 -translate-x-1/2 top-14 w-14 h-14 bg-black text-white rounded-full flex flex-col items-center justify-center shadow-lg z-10">
        <span className="text-[10px] font-bold leading-none mt-1 tracking-widest">POINT</span>
        <span className="text-2xl font-display leading-none mt-0.5">1</span>
      </div>

      <div className="text-center pt-24 px-4">
        <h2 className="font-display text-[80px] md:text-[96px] leading-[1.02]">
          {sectionName && (
            <>
              <span
                data-field="sectionName"
                style={{ ...titleGradientTextStyle(), fontWeight: 900 }}
              >
                {sectionName}
              </span>
              <br />
            </>
          )}
          <span
            data-field="sectionTitle"
            className="text-[#111827] relative inline-block mt-2"
            style={{ fontWeight: 900 }}
          >
            {sectionTitle}
            <div className="absolute bottom-1 left-0 w-full h-3 bg-[var(--theme-main)] opacity-20" />
          </span>
        </h2>

        <p data-field="sectionSubtitle" className="mt-8 text-[var(--theme-text-secondary)] font-bold text-lg md:text-xl">
          <span>{productName}의 상품정보 입니다.</span>
          <br />
          <span>아래의 제품정보를 확인해 주세요.</span>
        </p>
      </div>

      <SizeGuideSection d={d} />

      {hasColorSection && (
        <div data-section="colorImages">
          <div className="text-center mt-16">
            <div style={{ width: 384, height: 2 }} className="bg-[#2d3436] opacity-40 mx-auto mb-12" />
            <SubSectionBadge label="색상 안내" />

            {d.colorSubtitle && (
              <p className="mt-6 text-[var(--theme-text-secondary)] font-bold text-lg">
                {d.colorSubtitle}
              </p>
            )}

            {d.colorImages.length > 0 && (
              <div data-container="colorImages" className={`mt-10 flex flex-col gap-6 ${d.colorDisplayMode === 'full' ? 'w-full px-4' : 'max-w-2xl mx-auto px-6'}`}>
                {d.colorImages.map((cimg, i) => (
                  <img
                    key={i}
                    src={cimg}
                    alt="색상 안내"
                    className="w-full h-auto rounded-[var(--theme-radius)]"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {hasUsageSection && (
        <div data-section="usageImages">
          <div className="text-center mt-16">
            <div style={{ width: 384, height: 2 }} className="bg-[#2d3436] opacity-40 mx-auto mb-12" />
            <SubSectionBadge label="사용법 안내" />

            {usageSteps.length > 0 && (
              <ol data-field="usageSubtitle" className="mx-auto mt-8 flex max-w-2xl flex-col gap-5 px-6 text-left">
                {usageSteps.map((step, index) => (
                  <li
                    key={`${step}-${index}`}
                    className="overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-sm"
                  >
                    <div className="flex items-start gap-4 px-6 py-5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1e2d4d] text-base font-black text-white">
                        {index + 1}
                      </span>
                      <span className="pt-1 text-lg font-black leading-relaxed text-[var(--theme-text-primary)]">
                        {step}
                      </span>
                    </div>
                    {d.usageImages[index] && (
                      <img
                        src={d.usageImages[index]}
                        alt={`사용법 ${index + 1}`}
                        className="w-full h-auto"
                      />
                    )}
                  </li>
                ))}
              </ol>
            )}

            {usageSteps.length === 0 && d.usageImages.length > 0 && (
              <div data-container="usageImages" className="mt-10 flex flex-col gap-6 px-6 max-w-2xl mx-auto">
                {d.usageImages.map((uimg, i) => (
                  <img
                    key={i}
                    src={uimg}
                    alt="사용법 안내"
                    className="w-full h-auto rounded-[var(--theme-radius)]"
                  />
                ))}
              </div>
            )}

            {usageSteps.length > 0 && extraUsageImages.length > 0 && (
              <div data-container="usageImages" className="mt-6 flex flex-col gap-6 px-6 max-w-2xl mx-auto">
                {extraUsageImages.map((uimg, i) => (
                  <img
                    key={i}
                    src={uimg}
                    alt="추가 사용법 안내"
                    className="w-full h-auto rounded-[var(--theme-radius)]"
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div data-section="detailImages" className={hasDetailSection ? '' : 'hidden'}>
        <div className="text-center mt-16">
          <div style={{ width: 384, height: 2 }} className="bg-[#2d3436] opacity-40 mx-auto mb-12" />
          <SubSectionBadge label="DETAIL" />

          {detailSectionImages.length > 0 && (
            <div data-container="detailImages" className="mt-10 flex flex-col gap-6 px-6 max-w-2xl mx-auto">
              {detailSectionImages.map((dimg, i) => (
                <div key={i}>
                  <img
                    src={dimg}
                    alt="디테일 이미지"
                    className="w-full h-auto rounded-[var(--theme-radius)]"
                  />
                </div>
              ))}
            </div>
          )}

          {packageSectionImages.length > 0 && (
            <div data-container="detailPackageImages" className="mt-24 px-6 max-w-2xl mx-auto">
              <div className="mb-6 text-center font-black text-[var(--theme-text-primary)]">
                <p className="text-2xl md:text-3xl">{normalizePackageLabel(d.detailPackageLabel)}</p>
                <p className="mt-3 inline-block rounded-full bg-sky-100 px-6 py-2 text-lg md:text-xl text-sky-700">
                  {packageHelperText(normalizePackageLabel(d.detailPackageLabel))}
                </p>
              </div>
              <div className="flex flex-col gap-6">
                {packageSectionImages.map((dimg, i) => (
                  <div key={i}>
                    <img
                      src={dimg}
                      alt={normalizePackageLabel(d.detailPackageLabel)}
                      className="w-full h-auto rounded-[var(--theme-radius)]"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function uniqueImageUrls(urls: string[]): string[] {
  return Array.from(new Set(urls.filter((url) => url.trim() !== '')));
}

function normalizePackageLabel(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return '박스/세트 구성 이미지';
  return trimmed
    .replace(/^1\s*box\b/i, '1박스')
    .replace(/\s*이미지$/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function packageHelperText(label: string): string {
  if (/박스|box|BOX|개입/u.test(label)) return '박스 구성 확인';
  if (/세트|구성품/u.test(label)) return '세트 구성 확인';
  return '구성 확인';
}

// ─── Specs Section ──────────────────────────────────────────────────────────

function SpecsSection({ d }: { d: DetailPageData }) {
  const hasSafetyLabelImage = d.safetyLabelImages.length > 0;
  const showProductInfoTable = !hasSafetyLabelImage && d.productInfo.length > 0;

  return (
    <section data-section="specs" className="bg-[var(--theme-bg-light)] py-20 px-4">
      <div className="text-center">
        <SubSectionBadge label="INFO" />
      </div>

      {showProductInfoTable && (
        <div
          data-container="productInfo"
          className="mt-12 mx-auto overflow-hidden rounded-3xl bg-white shadow-sm border border-[#eadfce]"
          style={{ width: '82%', maxWidth: 500 }}
        >
          <table className="w-full border-collapse text-left text-[var(--theme-text-primary)]">
            <tbody>
              {d.productInfo.map((info, i) => (
                <tr key={i} className="border-b border-[#efe7dc] last:border-b-0">
                  <th
                    data-field="productInfoKey"
                    className="w-[34%] bg-[#f8f2e9] px-6 py-4 text-base md:text-lg font-black text-[#1e2d4d]"
                    scope="row"
                  >
                    {normalizeProductInfoKey(info.key)}
                  </th>
                  <td
                    data-field="productInfoValue"
                    className="px-6 py-4 text-base md:text-lg font-bold leading-relaxed text-[var(--theme-text-primary)]"
                  >
                    {info.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {hasSafetyLabelImage && (
        <div data-container="safetyLabelImages" className="mt-10 max-w-2xl mx-auto flex flex-col gap-6">
          {d.safetyLabelImages.map((src, i) => (
            <img
              key={i}
              src={src}
              alt="제품 안전 품질표시"
              className="w-full h-auto rounded-2xl border border-white/70"
            />
          ))}
        </div>
      )}
    </section>
  );
}

function normalizeProductInfoKey(key: string): string {
  return key.replace(/^[*\s]+/, '').trim();
}

// ─── Key Points Section ─────────────────────────────────────────────────────

function KeyPointsSection({ d }: { d: DetailPageData }) {
  return (
    <section className="bg-white py-20 px-4">
      <div className="text-center mb-12">
        <SubSectionBadge label="핵심 포인트" />
      </div>
      <div className="max-w-2xl mx-auto flex flex-col gap-16">
        {d.keyPoints.map((kp, i) => (
          <div key={i} className="text-center">
            <div
              style={{ width: 56, height: 56 }}
              className="bg-[#1e2d4d] rounded-full flex items-center justify-center text-white font-bold text-xl mx-auto mb-5 shadow-md"
            >
              {String(kp.number).padStart(2, '0')}
            </div>
            <h3 className="font-display text-3xl md:text-4xl text-[var(--theme-text-primary)] mb-3 tracking-tight">
              {kp.title}
            </h3>
            <p className="text-[var(--theme-text-secondary)] font-bold text-base leading-relaxed whitespace-pre-line">
              {kp.description}
            </p>
            {kp.images.length > 0 && (
              <div className="mt-8">
                <img src={kp.images[0]} alt={kp.title} className="w-full h-auto rounded-[var(--theme-radius)]" />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Feature Grid Section ───────────────────────────────────────────────────

function FeatureGridSection({ d }: { d: DetailPageData }) {
  return (
    <section className="bg-white py-20 px-4">
      <div className="text-center mb-12">
        <SubSectionBadge label="특장점" />
      </div>
      <div className="max-w-2xl mx-auto grid grid-cols-2 gap-6">
        {d.features.map((feat, i) => (
          <div key={i} className="bg-[var(--theme-bg-light)] rounded-2xl p-6 text-center">
            <div className="text-3xl mb-3">{feat.icon}</div>
            <h4 className="font-bold text-[var(--theme-text-primary)] text-base mb-2">{feat.title}</h4>
            <p className="text-[var(--theme-text-secondary)] text-sm leading-relaxed">{feat.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Spec Table Section ─────────────────────────────────────────────────────

function SpecTableSection({ d }: { d: DetailPageData }) {
  return (
    <section className="bg-[var(--theme-bg-light)] py-20 px-4">
      <div className="text-center mb-12">
        <SubSectionBadge label="상품 스펙" />
      </div>
      <div className="max-w-md mx-auto">
        {d.specs.map((spec, i) => (
          <div key={i} className="flex justify-between py-3 border-b border-gray-200 last:border-b-0">
            <span className="text-[var(--theme-text-secondary)] text-sm">{spec.key}</span>
            <span className="text-[var(--theme-text-primary)] font-bold text-sm text-right ml-4">{spec.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Material Info Section ──────────────────────────────────────────────────

function MaterialInfoSection({ d }: { d: DetailPageData }) {
  return (
    <section className="bg-white py-20 px-4">
      <div className="text-center mb-12">
        <SubSectionBadge label="소재 정보" />
      </div>
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        {d.materials.map((mat, i) => (
          <div key={i} className="flex items-start gap-5 bg-[var(--theme-bg-light)] rounded-2xl p-6">
            {mat.image && (
              <img src={mat.image} alt={mat.title} className="w-20 h-20 rounded-xl object-cover shrink-0" />
            )}
            <div>
              <h4 className="font-bold text-[var(--theme-text-primary)] text-base mb-1">{mat.title}</h4>
              <p className="text-[var(--theme-text-secondary)] text-sm leading-relaxed">{mat.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Notes Section ──────────────────────────────────────────────────────────

function NotesSection({ d }: { d: DetailPageData }) {
  return (
    <section className="bg-white py-16 px-4">
      <div className="max-w-md mx-auto bg-[var(--theme-bg-light)] rounded-2xl p-8">
        <h4 className="font-bold text-[var(--theme-text-primary)] text-base mb-4 flex items-center gap-2">
          <span>⚠️</span> 주의사항
        </h4>
        <ul className="list-disc list-inside space-y-2 text-[var(--theme-text-secondary)] text-sm leading-relaxed">
          {d.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ─── CS / Refund Section ────────────────────────────────────────────────────

function CSRefundSection({ d }: { d: DetailPageData }) {
  const cs = d.csInfo;
  if (!cs) return null;
  const hasContact = cs.phone || cs.kakao;
  const hasRules = cs.refundRules.length > 0;
  if (!hasContact && !hasRules) return null;

  return (
    <section className="bg-[var(--theme-bg-light)] py-20 px-4">
      <div className="text-center mb-12">
        <SubSectionBadge label="고객센터 / 교환·반품" />
      </div>
      <div className="max-w-md mx-auto text-center">
        {hasContact && (
          <div className="mb-8 space-y-2">
            {cs.phone && (
              <p className="text-[var(--theme-text-primary)] font-bold text-lg">
                📞 {cs.phone}
              </p>
            )}
            {cs.kakao && (
              <p className="text-[var(--theme-text-secondary)] font-bold text-base">
                💬 카카오톡 {cs.kakao}
              </p>
            )}
          </div>
        )}
        {hasRules && (
          <div className="bg-white/60 backdrop-blur-sm rounded-2xl p-8 text-left border border-white/50">
            <h4 className="font-bold text-[var(--theme-text-primary)] text-sm mb-4">교환/반품 안내</h4>
            <ul className="list-disc list-inside space-y-2 text-[var(--theme-text-secondary)] text-sm leading-relaxed">
              {cs.refundRules.map((rule, i) => (
                <li key={i}>{rule}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function BoldVertical({ data: d }: BoldVerticalProps) {
  const disabled = getDisabledSections(d);

  const hasPointContent =
    d.hookText ||
    d.hookTitleSub ||
    d.sectionName ||
    d.sectionTitle ||
    d.sizeImages.length > 0 ||
    d.colorImages.length > 0 ||
    d.colorSubtitle.trim() !== '' ||
    d.usageImages.length > 0 ||
    d.usageSubtitle.trim() !== '' ||
    d.detailImages.length > 0;
  const hasSpecsContent = d.productInfo.length > 0 || d.safetyLabelImages.length > 0;

  return (
    <div
      style={{
        ...themeVars(d),
        fontFamily: "'NanumSquareRoundLocal', 'Noto Sans KR', sans-serif",
        wordBreak: 'keep-all',
        backgroundColor: 'var(--theme-section-bg)',
      }}
    >
      <div className="py-10">
        <div className="max-w-3xl mx-auto bg-white shadow-2xl">
          {!disabled.has('main_hook') && <HeroSection d={d} />}

          {hasPointContent && <PointSection d={d} />}

          {hasSpecsContent && <SpecsSection d={d} />}
        </div>
      </div>
    </div>
  );
}
