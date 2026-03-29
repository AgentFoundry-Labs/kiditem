/**
 * Simple Vertical template — React component.
 *
 * Converted from apps/backend/app/templates/simple_vertical.html.
 * Uses Tailwind CSS utility classes + CSS custom properties for theming.
 */
import type { CSSProperties } from 'react';
import type { DetailPageData } from '../types';

interface SimpleVerticalProps {
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

/** Resolve disabled sections from layout config. */
function getDisabledSections(d: DetailPageData): Set<string> {
  const disabled = new Set<string>();
  if (d.layout?.components) {
    for (const slot of d.layout.components) {
      if (!slot.enabled) disabled.add(slot.type);
    }
  }
  return disabled;
}

// ─── Hero / Hook Section ────────────────────────────────────────────────────

function HookSection({
  d,
  disabled,
}: { d: DetailPageData; disabled: Set<string> }) {
  const hookLines = (d.hookText || d.title).split('\n');

  return (
    <section className="pt-24 pb-16 px-8 md:px-12 text-center relative overflow-hidden">
      {d.hookSubtext && (
        <span className="inline-block px-4 py-1.5 bg-[var(--theme-main)] text-white text-xs font-bold tracking-widest rounded-full mb-6 shadow-sm">
          {d.hookSubtext}
        </span>
      )}

      <h1 className="text-5xl md:text-6xl font-black text-[var(--theme-text-primary)] mb-6 tracking-tight leading-[1.2] break-keep">
        <span className="text-[var(--theme-main)]">{hookLines[0]}</span>
        {hookLines.slice(1).map((line, i) => (
          <span key={i}>
            <br />
            {line}
          </span>
        ))}
      </h1>

      {d.description.length > 0 && (
        <p className="text-lg text-[var(--theme-text-secondary)] mb-12 font-medium tracking-wide break-keep">
          {d.description.map((line, i) => (
            <span key={i}>
              {line}
              {i < d.description.length - 1 && <br />}
            </span>
          ))}
        </p>
      )}

      {d.images.length > 0 && !disabled.has('product_images') && (
        <div className="bg-[var(--theme-bg-light)] w-full rounded-[var(--theme-radius)] overflow-hidden shadow-lg">
          <img
            src={d.images[0]}
            alt={d.title}
            className="w-full h-auto block"
          />
        </div>
      )}
    </section>
  );
}

// ─── Key Points Section ─────────────────────────────────────────────────────

function KeyPointsSection({ d }: { d: DetailPageData }) {
  return (
    <>
      {d.keyPoints.map((kp, i) => (
        <section key={i} className="py-20 px-8 md:px-12 bg-[var(--theme-bg-light)]">
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-col items-center text-center mb-12">
              <div
                className={`w-16 h-16 bg-[var(--theme-badge-1)] rounded-full flex items-center justify-center text-white font-black text-2xl mb-6 shadow-md transform ${(i + 1) % 2 !== 0 ? '-rotate-6' : 'rotate-6'}`}
              >
                {String(kp.number).padStart(2, '0')}
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-[var(--theme-text-primary)] mb-4 tracking-tight break-keep">
                {kp.title}
              </h2>
              <p className="text-[var(--theme-text-secondary)] leading-relaxed font-medium break-keep whitespace-pre-line">
                {kp.description}
              </p>
            </div>

            {kp.images.length > 0 && (
              <div className="bg-[var(--theme-section-bg)] w-full rounded-[24px] overflow-hidden border-2 border-dashed border-[#f0dcd2]">
                <img
                  src={kp.images[0]}
                  alt={kp.title}
                  className="w-full h-auto block"
                />
              </div>
            )}
          </div>
        </section>
      ))}
    </>
  );
}

// ─── Size Guide Section ─────────────────────────────────────────────────────

function SizeGuideSection({ d }: { d: DetailPageData }) {
  const pointNumber = d.keyPoints.length + 1;

  return (
    <section className="py-20 px-8 md:px-12 bg-white">
      <div className="flex flex-col items-center text-center mb-12">
        <div className="w-16 h-16 bg-[var(--theme-badge-2)] rounded-full flex items-center justify-center text-white font-black text-2xl mb-6 shadow-md transform rotate-6">
          {String(pointNumber).padStart(2, '0')}
        </div>
        <h2 className="text-3xl md:text-4xl font-black text-[var(--theme-text-primary)] mb-4 tracking-tight break-keep">
          한눈에 보는 사이즈
        </h2>
        <p className="text-[var(--theme-text-secondary)] leading-relaxed font-medium break-keep">
          {d.sizeSubtitle || '정확한 사이즈를 확인해보세요'}
        </p>
      </div>

      <div className="w-full flex flex-col gap-4 px-8 md:px-12">
        {d.sizeImages.map((simg, i) => (
          <div
            key={i}
            className="bg-[var(--theme-section-bg)] w-full rounded-[24px] overflow-hidden border-2 border-dashed border-[#f0dcd2]"
          >
            <img
              src={simg}
              alt="사이즈 안내"
              className="w-full h-auto block"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Color Guide Section ────────────────────────────────────────────────────

function ColorGuideSection({ d }: { d: DetailPageData }) {
  const pointNumber = d.keyPoints.length + 2;

  return (
    <section className="py-20 px-8 md:px-12 bg-white border-t border-[#f0e6d2]">
      <div className="flex flex-col items-center text-center mb-12">
        <div className="w-16 h-16 bg-[var(--theme-badge-2)] rounded-full flex items-center justify-center text-white font-black text-2xl mb-6 shadow-md transform -rotate-6">
          {String(pointNumber).padStart(2, '0')}
        </div>
        <h2 className="text-3xl md:text-4xl font-black text-[var(--theme-text-primary)] mb-4 tracking-tight break-keep">
          한눈에 보는 색상
        </h2>
        <p className="text-[var(--theme-text-secondary)] leading-relaxed font-medium break-keep">
          {d.colorSubtitle || '다양한 색상을 확인해보세요'}
        </p>
      </div>

      <div className="w-full flex flex-col gap-4 px-8 md:px-12">
        {d.colorImages.map((cimg, i) => (
          <div
            key={i}
            className="bg-[var(--theme-section-bg)] w-full rounded-[24px] overflow-hidden border-2 border-dashed border-[#f0dcd2]"
          >
            <img
              src={cimg}
              alt="색상 안내"
              className="w-full h-auto block"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Detail Images Section ──────────────────────────────────────────────────

function DetailImagesSection({ d }: { d: DetailPageData }) {
  return (
    <section className="py-20 bg-[var(--theme-bg-light)]">
      <div className="px-8 md:px-12 mb-12 text-center">
        <div className="inline-flex items-center justify-center gap-2 mb-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[#ffed4a]"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
          <h2 className="text-2xl font-black text-[var(--theme-text-primary)] tracking-tight">
            DETAIL POINT
          </h2>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[#ffed4a]"
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </div>
      </div>

      <div className="w-full flex flex-col gap-4 px-8 md:px-12">
        {d.detailImages.map((dimg, i) => (
          <div
            key={i}
            className="bg-[var(--theme-section-bg)] w-full rounded-[24px] overflow-hidden border-2 border-dashed border-[#f0dcd2]"
          >
            <img
              src={dimg}
              alt="디테일 이미지"
              className="w-full h-auto block"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── Footer Section (specs + notes) ─────────────────────────────────────────

function FooterSection({
  d,
  disabled,
}: { d: DetailPageData; disabled: Set<string> }) {
  return (
    <section className="py-16 px-8 md:px-12 bg-white border-t border-[#f0e6d2]">
      <h3 className="font-black text-[var(--theme-text-primary)] mb-8 text-lg tracking-tight flex items-center gap-2">
        <span className="w-1.5 h-6 bg-[var(--theme-main)] rounded-full inline-block" />
        꼭 확인해주세요!
      </h3>

      {d.productInfo.length > 0 && !disabled.has('spec_table') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-12 mb-10 text-sm">
          {d.productInfo.map((info, i) => (
            <div
              key={i}
              className="flex justify-between border-b border-gray-100 pb-3"
            >
              <span className="text-gray-500">{info.key}</span>
              <span className="text-[var(--theme-text-primary)] font-bold text-right ml-4 break-words">
                {info.value}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="bg-[var(--theme-bg-light)] p-8 rounded-[24px] flex flex-col md:flex-row justify-between items-start gap-8 border border-[#f0e6d2]">
        {d.notes.length > 0 && (
          <div>
            <h4 className="font-black text-[var(--theme-text-primary)] mb-3 text-sm">
              ⚠️ 취급 시 주의사항
            </h4>
            <ul className="list-disc list-inside space-y-2 text-[var(--theme-text-secondary)] text-xs font-medium break-keep">
              {d.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col items-center shrink-0 text-[var(--theme-main)]">
          <svg
            className="w-12 h-12 mb-2"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          <span className="text-[10px] font-black tracking-widest">
            분리배출
          </span>
        </div>
      </div>
    </section>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function SimpleVertical({ data: d }: SimpleVerticalProps) {
  const disabled = getDisabledSections(d);

  return (
    <div
      style={{
        ...themeVars(d),
        fontFamily: "'Pretendard', sans-serif",
        wordBreak: 'keep-all',
      }}
      className="bg-[var(--theme-section-bg)] py-10 flex justify-center"
    >
      <div className="w-full max-w-[860px] bg-white overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.05)] rounded-t-[40px] border-x border-t border-[#f0e6d2]">
        {(d.hookText || d.title) && !disabled.has('main_hook') && (
          <HookSection d={d} disabled={disabled} />
        )}

        {d.keyPoints.length > 0 && !disabled.has('key_points') && (
          <KeyPointsSection d={d} />
        )}

        {d.sizeImages.length > 0 && !disabled.has('size_guide') && (
          <SizeGuideSection d={d} />
        )}

        {d.colorImages.length > 0 && !disabled.has('color_guide') && (
          <ColorGuideSection d={d} />
        )}

        {d.detailImages.length > 0 && !disabled.has('detail_images') && (
          <DetailImagesSection d={d} />
        )}

        <FooterSection d={d} disabled={disabled} />
      </div>
    </div>
  );
}
