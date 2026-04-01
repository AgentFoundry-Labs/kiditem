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

// ─── Hero Section (heroes/bold_v1.html) ─────────────────────────────────────

function HeroSection({ d }: { d: DetailPageData }) {
  const bannerSrc = d.heroBanner || d.images[0] || '';

  return (
    <section className="bg-[var(--theme-bg-light)] pb-20">
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
        <div className="w-48 h-0.5 bg-[var(--theme-main)] opacity-40 mb-6" />
        <h1 className="font-display text-7xl md:text-8xl tracking-tight leading-[1.1]">
          <span data-field="hookText" className="text-[var(--theme-badge-2)]">{d.hookText}</span>
          {d.hookTitleSub && (
            <>
              <br />
              <span data-field="hookTitleSub" className="text-[var(--theme-main)]">{d.hookTitleSub}</span>
            </>
          )}
        </h1>
        <div className="w-64 h-0.5 bg-[var(--theme-main)] opacity-40 mt-6" />

        {d.description.length > 0 && (
          <p data-field="description" className="mt-6 text-lg md:text-xl font-bold text-[var(--theme-text-primary)]">
            {d.description.map((line, i) => (
              <span key={i}>
                {line}
                {i < d.description.length - 1 && <br />}
              </span>
            ))}
          </p>
        )}
      </div>

      {d.images.length > 0 && (
        <div className="mt-16">
          <img data-field="heroImage" src={d.images[0]} alt={d.title} className="w-full h-auto" />
        </div>
      )}
    </section>
  );
}

// ─── Sub-section badge ──────────────────────────────────────────────────────

function SubSectionBadge({ label }: { label: string }) {
  return (
    <div className="inline-block bg-[#1e2d4d] text-white rounded-full px-12 py-2 font-bold text-xl tracking-widest shadow-md">
      {label}
    </div>
  );
}

// ─── Point Section ──────────────────────────────────────────────────────────

function PointSection({ d }: { d: DetailPageData }) {
  return (
    <section className="bg-white pb-20 relative">
      <div className="absolute left-1/2 -translate-x-1/2 -top-7 w-14 h-14 bg-black text-white rounded-full flex flex-col items-center justify-center shadow-lg z-10">
        <span className="text-[10px] font-bold leading-none mt-1 tracking-widest">POINT</span>
        <span className="text-2xl font-display leading-none mt-0.5">1</span>
      </div>

      <div className="text-center pt-20 px-4">
        <h2 className="font-display text-5xl md:text-6xl leading-tight">
          {d.sectionName && (
            <>
              <span data-field="sectionName" className="text-[var(--theme-badge-2)]">{d.sectionName}</span>
              <br />
            </>
          )}
          <span data-field="sectionTitle" className="text-[var(--theme-main)] relative inline-block mt-2">
            {d.sectionTitle}
            <div className="absolute bottom-1 left-0 w-full h-3 bg-[var(--theme-main)] opacity-20" />
          </span>
        </h2>

        {d.sectionSubtitle.length > 0 && (
          <p data-field="sectionSubtitle" className="mt-8 text-[var(--theme-text-secondary)] font-bold text-lg md:text-xl">
            {d.sectionSubtitle.map((line, i) => (
              <span key={i}>
                {line}
                {i < d.sectionSubtitle.length - 1 && <br />}
              </span>
            ))}
          </p>
        )}
      </div>

      <div data-section="sizeImages" className={d.sizeImages.length > 0 ? '' : 'hidden'}>
        <div className="text-center mt-16">
          <SubSectionBadge label="사이즈 안내" />

          {d.sizeSubtitle && (
            <p className="mt-6 text-[var(--theme-text-secondary)] font-bold text-lg">
              {d.sizeSubtitle}
            </p>
          )}

          <div data-container="sizeImages" className={`mt-10 flex flex-col gap-6 ${d.sizeDisplayMode === 'full' ? 'w-full px-4' : 'max-w-2xl mx-auto px-6'}`}>
            {d.sizeImages.map((simg, i) => (
              <img
                key={i}
                src={simg}
                alt="사이즈 안내"
                className="w-full h-auto rounded-[var(--theme-radius)] shadow-md"
              />
            ))}
          </div>
        </div>
      </div>

      {d.colorImages.length > 0 && (
        <div data-section="colorImages">
          <div className="text-center mt-16">
            <div style={{ width: 384, height: 2 }} className="bg-[#2d3436] opacity-40 mx-auto mb-12" />
            <SubSectionBadge label="색상 안내" />

            {d.colorSubtitle && (
              <p className="mt-6 text-[var(--theme-text-secondary)] font-bold text-lg">
                {d.colorSubtitle}
              </p>
            )}

            <div data-container="colorImages" className={`mt-10 flex flex-col gap-6 ${d.colorDisplayMode === 'full' ? 'w-full px-4' : 'max-w-2xl mx-auto px-6'}`}>
              {d.colorImages.map((cimg, i) => (
                <img
                  key={i}
                  src={cimg}
                  alt="색상 안내"
                  className="w-full h-auto rounded-[var(--theme-radius)] shadow-md"
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div data-section="detailImages" className={d.detailImages.length > 0 ? '' : 'hidden'}>
        <div className="text-center mt-16">
          <div style={{ width: 384, height: 2 }} className="bg-[#2d3436] opacity-40 mx-auto mb-12" />
          <SubSectionBadge label="DETAIL" />

          {d.detailText && (
            <p data-field="detailText" className="mt-6 text-[var(--theme-text-secondary)] font-bold text-lg">
              {d.detailText}
            </p>
          )}

          <div data-container="detailImages" className="mt-10 flex flex-col gap-6 px-6 max-w-2xl mx-auto">
            {d.detailImages.map((dimg, i) => (
              <img
                key={i}
                src={dimg}
                alt="디테일 이미지"
                className="w-full h-auto rounded-[var(--theme-radius)] shadow-md"
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Specs Section ──────────────────────────────────────────────────────────

function SpecsSection({ d }: { d: DetailPageData }) {
  return (
    <section className="bg-[var(--theme-bg-light)] py-20 px-4">
      <div className="text-center">
        <div className="inline-block bg-[#1A3668] text-white rounded-full px-10 py-4 font-bold text-xl shadow-lg">
          제품 안전 특별법에 의한 품질표시
        </div>
      </div>

      <div className="mt-12 max-w-md mx-auto bg-white/60 backdrop-blur-sm rounded-3xl p-10 text-center text-[var(--theme-text-primary)] font-bold text-lg leading-loose shadow-sm border border-white/50">
        {d.productInfo.map((info, i) => (
          <p key={i}>
            *{info.key} : {info.value}
          </p>
        ))}
      </div>
    </section>
  );
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
                <img src={kp.images[0]} alt={kp.title} className="w-full h-auto rounded-[var(--theme-radius)] shadow-md" />
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

  const hasPointContent = d.sectionName || d.sectionTitle || d.sizeImages.length > 0 || d.colorImages.length > 0 || d.detailImages.length > 0;

  return (
    <div
      style={{
        ...themeVars(d),
        fontFamily: "'Noto Sans KR', sans-serif",
        wordBreak: 'keep-all',
        backgroundColor: 'var(--theme-section-bg)',
      }}
    >
      <div className="py-10">
        <div className="max-w-3xl mx-auto bg-white shadow-2xl">
          {!disabled.has('main_hook') && <HeroSection d={d} />}

          {hasPointContent && <PointSection d={d} />}

          {d.productInfo.length > 0 && <SpecsSection d={d} />}
        </div>
      </div>
    </div>
  );
}
