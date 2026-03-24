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
            src={bannerSrc}
            alt={d.title}
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="text-center mt-16 px-4 flex flex-col items-center">
        <div className="w-48 h-0.5 bg-[var(--theme-main)] opacity-40 mb-6" />
        <h1 className="font-display text-7xl md:text-8xl tracking-tight leading-[1.1]">
          <span className="text-[var(--theme-badge-2)]">{d.hookText}</span>
          {d.hookTitleSub && (
            <>
              <br />
              <span className="text-[var(--theme-main)]">{d.hookTitleSub}</span>
            </>
          )}
        </h1>
        <div className="w-64 h-0.5 bg-[var(--theme-main)] opacity-40 mt-6" />

        {d.description.length > 0 && (
          <p className="mt-6 text-lg md:text-xl font-bold text-[var(--theme-text-primary)]">
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
          <img src={d.images[0]} alt={d.title} className="w-full h-auto" />
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
      <div className="absolute left-1/2 -translate-x-1/2 -top-12 w-[72px] h-[96px] z-10">
        <svg viewBox="0 0 60 80" className="w-full h-full drop-shadow-lg">
          <path
            d="M30 0C30 0 0 40 0 55C0 68.8 13.4 80 30 80C46.6 80 60 68.8 60 55C60 40 30 0 30 0Z"
            fill="#2d3436"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white pt-4">
          <span className="text-[10px] font-bold tracking-[0.2em] leading-none">
            POINT
          </span>
          <span className="text-2xl font-display leading-none mt-1">1</span>
        </div>
      </div>

      <div className="text-center pt-20 px-4">
        <h2 className="font-display text-5xl md:text-6xl leading-tight">
          {d.sectionName && (
            <>
              <span className="text-[var(--theme-badge-2)]">{d.sectionName}</span>
              <br />
            </>
          )}
          <span className="text-[var(--theme-main)] relative inline-block mt-2">
            {d.sectionTitle}
            <div className="absolute bottom-1 left-0 w-full h-3 bg-[var(--theme-main)] opacity-20" />
          </span>
        </h2>

        {d.sectionSubtitle.length > 0 && (
          <p className="mt-8 text-[var(--theme-text-secondary)] font-bold text-lg md:text-xl">
            {d.sectionSubtitle.map((line, i) => (
              <span key={i}>
                {line}
                {i < d.sectionSubtitle.length - 1 && <br />}
              </span>
            ))}
          </p>
        )}
      </div>

      {d.sizeImages.length > 0 && (
        <div className="text-center mt-16">
          <SubSectionBadge label={d.sizeTitle || '사이즈 안내'} />

          {d.sizeSubtitle && (
            <p className="mt-6 text-[var(--theme-text-secondary)] font-bold text-lg">
              {d.sizeSubtitle}
            </p>
          )}

          <div className={`mt-10 flex flex-col gap-6 ${d.sizeDisplayMode === 'full' ? 'w-full px-4' : 'max-w-2xl mx-auto px-6'}`}>
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
      )}

      {d.colorText && (
        <div className="text-center mt-16">
          <SubSectionBadge label="제품색상" />
          <p className="mt-6 text-[var(--theme-text-secondary)] font-bold text-lg">
            {d.colorText}
          </p>
        </div>
      )}

      {d.detailImages.length > 0 && (
        <div className="text-center mt-16">
          <SubSectionBadge label={d.detailTitle || 'DETAIL'} />

          {d.detailText && (
            <p className="mt-6 text-[var(--theme-text-secondary)] font-bold text-lg">
              {d.detailText}
            </p>
          )}

          <div className="mt-10 flex flex-col gap-6 px-6 max-w-2xl mx-auto">
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
      )}
    </section>
  );
}

// ─── Specs Section ──────────────────────────────────────────────────────────

function SpecsSection({ d }: { d: DetailPageData }) {
  return (
    <section className="bg-[var(--theme-bg-light)] py-20 px-4">
      <div className="text-center">
        <div className="inline-block bg-[#1e2d4d] text-white rounded-full px-10 py-4 font-bold text-xl shadow-lg">
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

// ─── Main Component ─────────────────────────────────────────────────────────

export function BoldVertical({ data: d }: BoldVerticalProps) {
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
          <HeroSection d={d} />

          {(d.sectionName || d.sectionTitle || d.sizeImages.length > 0 || d.detailImages.length > 0) && <PointSection d={d} />}

          {d.productInfo.length > 0 && <SpecsSection d={d} />}
        </div>
      </div>
    </div>
  );
}
