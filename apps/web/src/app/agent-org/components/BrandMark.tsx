import { cn } from '@/lib/utils';
import { BRAND_MARKS, type BrandKey } from '../lib/brand-marks';

/**
 * 바깥 서비스 로고 타일. 앱 아이콘처럼 대표색 바탕에 모양 하나.
 *
 * 옆에 이름이 같이 적히는 자리에서는 `decorative` 로 스크린리더에 두 번 읽히지 않게 한다.
 */
export function BrandMark({
  brand,
  size = 36,
  decorative = false,
  className,
}: {
  brand: BrandKey;
  size?: number;
  decorative?: boolean;
  className?: string;
}) {
  const def = BRAND_MARKS[brand];
  const glyph = Math.round(size * 0.56);
  const a11y = decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': def.name };

  return (
    <span
      {...a11y}
      title={def.name}
      className={cn('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-lg', className)}
      style={{ width: size, height: size, background: def.background }}
    >
      {def.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- public 정적 파일
        <img src={def.src} alt="" width={glyph} height={glyph} className="object-contain" />
      ) : def.kind === 'text' ? (
        <span className="font-extrabold leading-none tracking-tight" style={{ color: def.color, fontSize: Math.round(size * 0.3) }}>
          {def.text}
        </span>
      ) : (
        <svg viewBox="0 0 24 24" width={glyph} height={glyph} aria-hidden>
          {def.underlay ? <circle cx="12" cy="12" r="9.5" fill={def.underlay} /> : null}
          {def.echo ? (
            <>
              <path d={def.path} fill={def.echo[0]} transform="translate(-0.8 -0.6)" />
              <path d={def.path} fill={def.echo[1]} transform="translate(0.8 0.6)" />
            </>
          ) : null}
          <path d={def.path} fill={def.color} />
        </svg>
      )}
    </span>
  );
}
